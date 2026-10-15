import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ErroConfig } from '../skills/ghl-scripts/scripts/lib/erros.mjs';
import { obterTokenSessao, renovarSessao, tokenVivo, utilizadorDoToken } from '../skills/ghl-scripts/scripts/lib/sessao.mjs';
import { comAmbiente, fetchFalso, jwt, resposta } from './ajudas.mjs';

const daqui = (segundos) => Math.floor(Date.now() / 1000) + segundos;

test('tokenVivo exige mais de 2 minutos de vida', () => {
  assert.equal(tokenVivo(jwt({ exp: daqui(3600) })), true);
  assert.equal(tokenVivo(jwt({ exp: daqui(60) })), false);
  assert.equal(tokenVivo('lixo'), false);
});

test('utilizadorDoToken le o user_id', () => {
  assert.equal(utilizadorDoToken(jwt({ user_id: 'U9' })), 'U9');
});

async function comCache(fn) {
  const pasta = await mkdtemp(join(tmpdir(), 'ghl-skills-teste-'));
  try {
    return await fn(join(pasta, 'sessao.json'));
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

test('renova pelo refresh token, guarda a cache e reutiliza-a', () =>
  comCache((cache) =>
    comAmbiente({ GHL_TOKEN_CACHE: cache, GHL_REFRESH_TOKEN: 'R1', GHL_FIREBASE_KEY: 'K', GHL_TOKEN: undefined }, async () => {
      const novo = jwt({ exp: daqui(3600), user_id: 'U1' });
      const f = fetchFalso([resposta(200, { id_token: novo, refresh_token: 'R2', expires_in: '3600' })]);
      assert.equal(await obterTokenSessao({ fetchFn: f }), novo);
      assert.match(f.chamadas[0].url, /securetoken\.googleapis\.com\/v1\/token\?key=K/);
      assert.match(f.chamadas[0].body, /refresh_token=R1/);

      const guardado = JSON.parse(await readFile(cache, 'utf8'));
      assert.equal(guardado.refreshToken, 'R2', 'guarda o refresh rodado');
      assert.ok(!JSON.stringify(guardado).includes('R1'), 'nao guarda o refresh do .env em claro');

      const semRede = fetchFalso([]);
      assert.equal(await obterTokenSessao({ fetchFn: semRede }), novo, 'segunda chamada vem da cache');
    }),
  ));

test('um refresh token novo no .env ignora a cache da sessao antiga', () =>
  comCache((cache) =>
    comAmbiente({ GHL_TOKEN_CACHE: cache, GHL_REFRESH_TOKEN: 'R1', GHL_FIREBASE_KEY: 'K' }, async () => {
      const t1 = jwt({ exp: daqui(3600), n: 1 });
      await obterTokenSessao({ fetchFn: fetchFalso([resposta(200, { id_token: t1, refresh_token: 'R1b' })]) });

      process.env.GHL_REFRESH_TOKEN = 'R9';
      const t2 = jwt({ exp: daqui(3600), n: 2 });
      const f = fetchFalso([resposta(200, { id_token: t2, refresh_token: 'R9' })]);
      assert.equal(await obterTokenSessao({ fetchFn: f }), t2);
      assert.match(f.chamadas[0].body, /refresh_token=R9/, 'usa o do .env, nao o rodado da sessao antiga');
    }),
  ));

test('sem GHL_FIREBASE_KEY explica onde a encontrar', () =>
  comCache((cache) =>
    comAmbiente({ GHL_TOKEN_CACHE: cache, GHL_REFRESH_TOKEN: 'R1', GHL_FIREBASE_KEY: undefined }, async () => {
      await assert.rejects(obterTokenSessao({ fetchFn: fetchFalso([]) }), /value\.apiKey/);
    }),
  ));

test('sem nenhuma credencial, ErroConfig com instrucoes', () =>
  comCache((cache) =>
    comAmbiente({ GHL_TOKEN_CACHE: cache, GHL_REFRESH_TOKEN: undefined, GHL_FIREBASE_KEY: undefined, GHL_TOKEN: undefined }, async () => {
      await assert.rejects(obterTokenSessao(), ErroConfig);
    }),
  ));

test('GHL_TOKEN colado a mao serve enquanto vive', () =>
  comCache((cache) =>
    comAmbiente({ GHL_TOKEN_CACHE: cache, GHL_REFRESH_TOKEN: undefined, GHL_TOKEN: `Bearer ${jwt({ exp: daqui(3600) })}` }, async () => {
      assert.ok(tokenVivo(await obterTokenSessao()));
    }),
  ));

test('sessao revogada da uma mensagem que diz o que fazer', async () => {
  const f = fetchFalso([resposta(400, { error: { message: 'TOKEN_EXPIRED' } })]);
  await assert.rejects(renovarSessao('R', 'K', { fetchFn: f }), /TOKEN_EXPIRED[\s\S]*GHL_REFRESH_TOKEN novo/);
});
