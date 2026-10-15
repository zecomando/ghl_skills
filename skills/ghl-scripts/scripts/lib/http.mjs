/**
 * O nucleo HTTP: ritmo por location e a politica de repeticao certa.
 *
 * PORQUE O POST NAO SE REPETE
 * Um 503 devolvido depois de o GHL ja ter criado a linha, ou uma ligacao que
 * cai depois de o pedido chegar, e indistinguivel de um que nunca aterrou.
 * Repetir `POST /calendars/events/appointments` (que nao tem chave de
 * idempotencia) ja transformou uma reuniao em quatro. Por isso:
 *   429          -> repete sempre: foi recusado antes de o GHL fazer trabalho
 *   5xx / rede   -> so repete GET/HEAD/OPTIONS/PUT/DELETE ou POST marcado idempotente
 *   outro 4xx    -> nunca repete: o erro e nosso e repetir so gasta orcamento
 */

import { ErroServidor, classificar } from './erros.mjs';

export const METODOS_REPETIVEIS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

const TENTATIVAS = 4;
const ESPERA_BASE_MS = 500;
const ESPERA_MAX_MS = 8000;

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Janela deslizante por chave (normalmente a location).
 * 80 pedidos/10 s e nao 100: o orcamento publicado do GHL (100/10 s e 200 000
 * por dia, por app e location) e partilhado com tudo o que toca na mesma
 * location, e um 429 custa mais do que a folga.
 */
export class Limitador {
  constructor({ maximo = Number(process.env.GHL_RATE_PER_10S) || 80, janelaMs = 10_000, relogio = Date.now, esperar = dormir } = {}) {
    this.maximo = maximo;
    this.janelaMs = janelaMs;
    this.relogio = relogio;
    this.esperar = esperar;
    this.marcas = new Map();
  }

  async aguardar(chave = '_') {
    if (!this.marcas.has(chave)) this.marcas.set(chave, []);
    const marcas = this.marcas.get(chave);
    for (;;) {
      const agora = this.relogio();
      while (marcas.length && agora - marcas[0] >= this.janelaMs) marcas.shift();
      if (marcas.length < this.maximo) {
        marcas.push(agora);
        return;
      }
      await this.esperar(Math.max(10, this.janelaMs - (agora - marcas[0])));
    }
  }
}

/** Espera exponencial com jitter total: varios clientes num 429 nao se ressincronizam. */
function atraso(tentativa) {
  const teto = Math.min(ESPERA_BASE_MS * 2 ** (tentativa - 1), ESPERA_MAX_MS);
  return Math.random() * teto;
}

function lerRetryAfter(resposta) {
  const valor = resposta.headers?.get?.('retry-after');
  if (!valor) return null;
  const segundos = Number(valor);
  if (Number.isFinite(segundos)) return segundos * 1000;
  const data = Date.parse(valor);
  return Number.isFinite(data) ? Math.max(0, data - Date.now()) : null;
}

function mensagemDe(texto) {
  try {
    const j = JSON.parse(texto);
    const m = j?.message ?? j?.error?.message ?? j?.error ?? j?.msg;
    if (Array.isArray(m)) return m.join('; ');
    if (m) return typeof m === 'string' ? m : JSON.stringify(m);
  } catch {
    // corpo nao e JSON
  }
  return (texto || '').slice(0, 300) || '(sem corpo)';
}

function traceDe(texto, resposta) {
  try {
    const j = JSON.parse(texto);
    if (j?.traceId) return j.traceId;
  } catch {
    // corpo nao e JSON
  }
  return resposta.headers?.get?.('x-trace-id') ?? null;
}

/**
 * Um pedido, com ritmo e repeticao. Devolve o JSON (ou texto, ou null);
 * lanca ErroAuth / ErroPedido / ErroLimite / ErroServidor — nunca devolve um
 * corpo de erro como se fosse sucesso.
 */
export async function pedir({
  metodo = 'GET',
  url,
  headers = {},
  corpo,
  idempotente = false,
  limitador,
  chave = '_',
  tentativas = TENTATIVAS,
  esperar = dormir,
  fetchFn = globalThis.fetch,
}) {
  const verbo = metodo.toUpperCase();
  const repetivel = METODOS_REPETIVEIS.has(verbo) || idempotente;
  const h = { Accept: 'application/json', ...headers };
  let body;
  if (corpo instanceof FormData) body = corpo;
  else if (corpo !== undefined) {
    body = JSON.stringify(corpo);
    h['Content-Type'] = 'application/json';
  }

  let ultimo;
  for (let n = 1; n <= tentativas; n++) {
    if (limitador) await limitador.aguardar(chave);

    let resposta;
    try {
      resposta = await fetchFn(url, { method: verbo, headers: h, body });
    } catch (e) {
      ultimo = new ErroServidor(0, `falha de transporte: ${e.message}`, { metodo: verbo, url });
      if (!repetivel || n === tentativas) throw ultimo;
      await esperar(atraso(n));
      continue;
    }

    const texto = await resposta.text();
    if (resposta.ok) {
      if (!texto) return null;
      try {
        return JSON.parse(texto);
      } catch {
        return texto;
      }
    }

    const retryAfter = lerRetryAfter(resposta);
    const erro = classificar(resposta.status, mensagemDe(texto), {
      metodo: verbo,
      url,
      corpo: texto.slice(0, 1000),
      traceId: traceDe(texto, resposta),
      retryAfter,
    });
    const repetir = resposta.status === 429 || (resposta.status >= 500 && repetivel);
    if (!repetir || n === tentativas) throw erro;
    ultimo = erro;
    await esperar(retryAfter != null ? Math.min(retryAfter, ESPERA_MAX_MS) : atraso(n));
  }
  throw ultimo;
}

/** URL com query bem codificada. Um `+` num telefone colado a mao na query vira espaco. */
export function montarUrl(base, caminho, query) {
  const url = new URL(caminho, base);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const x of v) url.searchParams.append(k, String(x));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}
