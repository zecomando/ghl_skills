import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErroAuth, ErroLimite, ErroPedido, ErroServidor } from '../skills/ghl-scripts/scripts/lib/erros.mjs';
import { Limitador, montarUrl, pedir } from '../skills/ghl-scripts/scripts/lib/http.mjs';
import { fetchFalso, resposta, semEspera } from './ajudas.mjs';

const base = { url: 'https://exemplo.test/x', esperar: semEspera };

test('429 repete-se (foi recusado antes de o GHL fazer trabalho), mesmo num POST', async () => {
  const f = fetchFalso([resposta(429, { message: 'too many' }), resposta(200, { ok: 1 })]);
  assert.deepEqual(await pedir({ ...base, metodo: 'POST', corpo: {}, fetchFn: f }), { ok: 1 });
  assert.equal(f.chamadas.length, 2);
});

test('503 num POST NAO se repete — pode ter aterrado', async () => {
  const f = fetchFalso([resposta(503, { message: 'down' }), resposta(200, {})]);
  await assert.rejects(pedir({ ...base, metodo: 'POST', corpo: {}, fetchFn: f }), ErroServidor);
  assert.equal(f.chamadas.length, 1);
});

test('503 num GET repete-se', async () => {
  const f = fetchFalso([resposta(503, 'x'), resposta(200, { a: 1 })]);
  assert.deepEqual(await pedir({ ...base, fetchFn: f }), { a: 1 });
  assert.equal(f.chamadas.length, 2);
});

test('POST declarado idempotente repete em 503', async () => {
  const f = fetchFalso([resposta(502, 'x'), resposta(200, { a: 1 })]);
  assert.deepEqual(await pedir({ ...base, metodo: 'POST', idempotente: true, corpo: {}, fetchFn: f }), { a: 1 });
});

test('422 e ErroPedido (a autenticacao passou) e nao se repete', async () => {
  const f = fetchFalso([resposta(422, { message: ['property skip should not exist'] }), resposta(200, {})]);
  const erro = await pedir({ ...base, fetchFn: f }).catch((e) => e);
  assert.ok(erro instanceof ErroPedido);
  assert.match(erro.message, /property skip should not exist/);
  assert.match(erro.dica(), /Nao mexer no token/);
  assert.equal(f.chamadas.length, 1);
});

test('401 e 403 sao ErroAuth', async () => {
  await assert.rejects(pedir({ ...base, fetchFn: fetchFalso([resposta(401, { message: 'Invalid JWT' })]) }), ErroAuth);
  await assert.rejects(pedir({ ...base, fetchFn: fetchFalso([resposta(403, {})]) }), ErroAuth);
});

test('falha de rede num POST nao se repete', async () => {
  const f = fetchFalso([new TypeError('fetch failed'), resposta(200, {})]);
  await assert.rejects(pedir({ ...base, metodo: 'POST', corpo: {}, fetchFn: f }), ErroServidor);
  assert.equal(f.chamadas.length, 1);
});

test('Retry-After e respeitado', async () => {
  const esperas = [];
  const f = fetchFalso([resposta(429, {}, { 'retry-after': '2' }), resposta(200, { a: 1 })]);
  await pedir({ ...base, fetchFn: f, esperar: async (ms) => esperas.push(ms) });
  assert.equal(esperas[0], 2000);
});

test('tentativas esgotadas lancam o ultimo erro', async () => {
  const f = fetchFalso([resposta(429, {}), resposta(429, {}), resposta(429, {}), resposta(429, {})]);
  await assert.rejects(pedir({ ...base, fetchFn: f }), ErroLimite);
  assert.equal(f.chamadas.length, 4);
});

test('corpo JSON leva Content-Type; resposta vazia devolve null', async () => {
  const f = fetchFalso([resposta(200)]);
  assert.equal(await pedir({ ...base, metodo: 'PUT', corpo: { a: 1 }, fetchFn: f }), null);
  assert.equal(f.chamadas[0].headers['Content-Type'], 'application/json');
  assert.equal(f.chamadas[0].body, '{"a":1}');
});

test('o Limitador espera quando a janela enche', async () => {
  let agora = 0;
  const esperas = [];
  const l = new Limitador({
    maximo: 2,
    janelaMs: 1000,
    relogio: () => agora,
    esperar: async (ms) => {
      esperas.push(ms);
      agora += ms;
    },
  });
  await l.aguardar('L');
  await l.aguardar('L');
  await l.aguardar('outra'); // outra location tem a sua propria janela
  assert.equal(esperas.length, 0);
  await l.aguardar('L');
  assert.deepEqual(esperas, [1000]);
});

test('montarUrl codifica o + de um telefone e repete chaves de array', () => {
  const u = montarUrl('https://h.test', '/contacts/search/duplicate', { number: '+351900000000', locationId: 'L', vazio: undefined });
  assert.match(u, /number=%2B351900000000/);
  assert.doesNotMatch(u, /vazio/);
  const v = new URL(montarUrl('https://h.test', '/s', { 'workflowIds[]': ['a', 'b'] }));
  assert.deepEqual(v.searchParams.getAll('workflowIds[]'), ['a', 'b']);
});
