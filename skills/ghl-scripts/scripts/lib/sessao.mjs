/**
 * Token de sessao do GHL para a API interna, sem copiar nada do DevTools de
 * hora a hora.
 *
 * O token de acesso (id_token Firebase) dura ~1 h, mas nasce de um refresh
 * token que dura ate a sessao ser revogada (logout, mudanca de password).
 * Captura-se UMA vez — ver a skill ghl-auth-interna — e a partir dai renova-se
 * sozinho no endpoint standard do Firebase:
 *
 *   POST https://securetoken.googleapis.com/v1/token?key=<GHL_FIREBASE_KEY>
 *   grant_type=refresh_token&refresh_token=<GHL_REFRESH_TOKEN>
 *
 * A cache fica FORA do projecto (~/.ghl-skills/sessao.json, ou GHL_TOKEN_CACHE)
 * para nao ir parar ao Git num `git add -A`. A cache guarda uma impressao do
 * refresh token do .env: se o .env mudar (sessao nova), a cache antiga e
 * ignorada em vez de insistir num token revogado.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ErroConfig } from './erros.mjs';

/** Folga antes do fim: nao vale a pena usar um token que morre ja. */
const MARGEM_MS = 120_000;

const SECURE_TOKEN = 'https://securetoken.googleapis.com/v1/token';

export function lerClaims(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function tokenVivo(jwt, agora = Date.now()) {
  const c = lerClaims(jwt);
  return c?.exp ? c.exp * 1000 - agora > MARGEM_MS : false;
}

/** O id do utilizador (vai no `updatedBy` ao publicar um workflow). */
export function utilizadorDoToken(jwt) {
  const c = lerClaims(jwt);
  return c?.user_id ?? c?.authClassId ?? c?.sub ?? null;
}

export function caminhoCache() {
  return process.env.GHL_TOKEN_CACHE || join(homedir(), '.ghl-skills', 'sessao.json');
}

const impressao = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

async function lerCache() {
  try {
    return JSON.parse(await readFile(caminhoCache(), 'utf8'));
  } catch {
    return null;
  }
}

async function gravarCache(dados) {
  const ficheiro = caminhoCache();
  await mkdir(dirname(ficheiro), { recursive: true, mode: 0o700 });
  await writeFile(ficheiro, JSON.stringify(dados, null, 2), { mode: 0o600 });
}

/** Troca o refresh token por um id_token novo. */
export async function renovarSessao(refreshToken, chaveFirebase, { fetchFn = globalThis.fetch } = {}) {
  const res = await fetchFn(`${SECURE_TOKEN}?key=${encodeURIComponent(chaveFirebase)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  });
  const texto = await res.text();
  if (!res.ok) {
    let motivo = texto.slice(0, 200);
    try {
      motivo = JSON.parse(texto).error?.message ?? motivo;
    } catch {
      // corpo nao e JSON
    }
    // TOKEN_EXPIRED / USER_DISABLED / INVALID_REFRESH_TOKEN sao definitivos:
    // repetir nao resolve, e preciso capturar um refresh token novo.
    throw new ErroConfig(
      `A renovacao da sessao falhou (${res.status}): ${motivo}\n` +
        'Se diz TOKEN_EXPIRED ou INVALID_REFRESH_TOKEN, a sessao foi terminada: captura um\n' +
        'GHL_REFRESH_TOKEN novo (skill ghl-auth-interna). Se diz API key not valid, confere GHL_FIREBASE_KEY.',
    );
  }
  const d = JSON.parse(texto);
  return {
    idToken: d.id_token,
    // O Firebase pode devolver um refresh token rodado; guarda-se o mais recente.
    refreshToken: d.refresh_token || refreshToken,
    expira: Date.now() + Number(d.expires_in || 3600) * 1000,
  };
}

/**
 * Um token de sessao valido, renovando se preciso.
 * Ordem: cache valida -> refresh token do .env -> GHL_TOKEN colado a mao (ultimo recurso, ~1 h).
 */
export async function obterTokenSessao({ forcar = false, fetchFn } = {}) {
  const refreshEnv = (process.env.GHL_REFRESH_TOKEN || '').trim();
  const chave = (process.env.GHL_FIREBASE_KEY || '').trim();
  const origem = refreshEnv ? impressao(refreshEnv) : null;
  const cache = await lerCache();
  const cacheDaSessao = Boolean(cache && origem && cache.origem === origem);

  if (!forcar && cacheDaSessao && cache.idToken && tokenVivo(cache.idToken)) return cache.idToken;

  if (refreshEnv) {
    if (!chave) {
      throw new ErroConfig(
        'Falta GHL_FIREBASE_KEY. Esta na mesma entrada do IndexedDB que o refresh token: value.apiKey\n' +
          '(skill ghl-auth-interna). E a chave web publica do Firebase do GHL, nao e um segredo.',
      );
    }
    const refresh = cacheDaSessao && cache.refreshToken ? cache.refreshToken : refreshEnv;
    const novo = await renovarSessao(refresh, chave, { fetchFn });
    await gravarCache({ origem, ...novo });
    return novo.idToken;
  }

  const manual = (process.env.GHL_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
  if (manual && tokenVivo(manual)) return manual;

  throw new ErroConfig(
    'Sem token de sessao utilizavel para a API interna.\n' +
      'Poe GHL_REFRESH_TOKEN e GHL_FIREBASE_KEY no .env (capturam-se uma vez e duram semanas) — ver a\n' +
      'skill ghl-auth-interna. Alternativa temporaria: GHL_TOKEN, que expira em ~1 h.',
  );
}
