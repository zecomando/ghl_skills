import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Guarda } from '../skills/ghl-scripts/scripts/lib/guarda.mjs';
import {
  corpoPreservado,
  criarClienteInterno,
  desembrulhar,
  lerFicheiroDoMotor,
  ordenarPorRamo,
  perdas,
} from '../skills/ghl-scripts/scripts/lib/interna.mjs';
import { fetchFalso, jwt, resposta, semEspera, silencio } from './ajudas.mjs';

const W = {
  _id: 'x',
  id: 'x',
  locationId: 'L1',
  __v: 3,
  fileUrl: 'https://storage.test/wf.json',
  parentId: 'pasta',
  name: 'Campanha',
  status: 'published',
  version: 21,
  workflowData: { templates: [{ id: 'a' }] },
  allowMultiple: true,
  allowMultipleOpportunity: true,
  window: { condition: 'when', start: '08:00', end: '23:00', days: [1, 2, 3, 4, 5] },
  senderAddress: null,
  workflowNote: { content: 'nota' },
};

test('corpoPreservado muda o pedido e preserva as definicoes', () => {
  const c = corpoPreservado(W, { workflowData: { templates: [{ id: 'b' }] } });
  assert.equal(c.workflowData.templates[0].id, 'b');
  assert.equal(c.allowMultiple, true);
  assert.equal(c.window.start, '08:00');
  assert.equal(c.workflowNote.content, 'nota');
  assert.ok('senderAddress' in c && c.senderAddress === null, 'um null legitimo passa');
  for (const k of ['_id', 'fileUrl', 'parentId', '__v']) assert.ok(!(k in c), `nao reenvia ${k}`);
  assert.ok(!('timezone' in c), 'nao inventa chaves ausentes');
});

test('corpoPreservado: a mudanca ganha, e nao arrasta o resto', () => {
  const c = corpoPreservado(W, { window: null });
  assert.equal(c.window, null);
  assert.equal(c.allowMultiple, true);
});

test('corpoPreservado recusa leituras vazias ou sem version', () => {
  assert.throws(() => corpoPreservado(null), /invalido/);
  assert.throws(() => corpoPreservado({ name: 'sem versao' }), /version/);
});

test('perdas mostra o que um PUT parcial apagaria', () => {
  assert.ok(perdas(W, { name: 'x' }).includes('allowMultiple'));
  assert.ok(!perdas(W, { name: 'x' }).includes('senderAddress'), 'default vazio nao conta');
  assert.deepEqual(perdas(W, corpoPreservado(W)), []);
});

test('ordenarPorRamo numera dentro de cada ramo, nao globalmente', () => {
  const r = ordenarPorRamo([
    { id: 'a' },
    { id: 'b' },
    { id: 'y1', parent: 'if' },
    { id: 'n1', parent: 'if' },
    { id: 'c' },
  ]);
  assert.deepEqual(r.map((p) => p.order), [0, 1, 0, 1, 2]);
});

test('desembrulhar nunca troca o objecto por {}', () => {
  assert.equal(desembrulhar.workflow({ workflow: { id: 1 } }).id, 1);
  assert.equal(desembrulhar.workflow({ id: 2 }).id, 2);
  assert.equal(desembrulhar.bot({ employee: { id: 3 } }).id, 3);
  assert.equal(desembrulhar.bot({ data: { id: 4 } }).id, 4);
  assert.equal(desembrulhar.workflow(undefined), undefined);
});

const TOKEN = jwt({ user_id: 'U1', exp: Math.floor(Date.now() / 1000) + 3600 });
const cliente = (f, guarda = new Guarda({ registar: silencio })) =>
  criarClienteInterno({ token: TOKEN, locationId: 'L1', fetchFn: f, esperar: semEspera, guarda });

test('o cliente interno usa token-id, channel e source', async () => {
  const f = fetchFalso([resposta(200, { triggers: [{ id: 't1' }] })]);
  const t = await cliente(f).lerTriggers('w1');
  assert.equal(t[0].id, 't1');
  const h = f.chamadas[0].headers;
  assert.equal(h['token-id'], TOKEN);
  assert.equal(h.channel, 'APP');
  assert.equal(h.source, 'WEB_USER');
  assert.ok(!('Authorization' in h), 'o id_token Firebase da 401 em Authorization');
  assert.equal(f.chamadas[0].url, 'https://backend.leadconnectorhq.com/workflow/L1/trigger?workflowId=w1');
});

test('listarWorkflows pagina e tira as pastas', async () => {
  const lote1 = Array.from({ length: 100 }, (_, i) => ({ _id: `w${i}`, type: 'workflow' }));
  const f = fetchFalso([
    resposta(200, { count: 102, rows: lote1 }),
    resposta(200, { count: 102, rows: [{ _id: 'w100', type: 'workflow' }, { _id: 'pasta', type: 'directory' }] }),
  ]);
  const lista = await cliente(f).listarWorkflows();
  assert.equal(lista.length, 101);
  assert.match(f.chamadas[1].url, /offset=100/);
});

test('lerWorkflow completa os passos a partir do fileUrl quando nao vem no documento', async () => {
  const f = fetchFalso([resposta(200, { _id: 'w1', locationId: 'L1', fileUrl: 'https://storage.test/w1.json' }), resposta(200, { templates: [{ id: 'p' }] })]);
  const w = await cliente(f).lerWorkflow('w1');
  assert.equal(w.workflowData.templates[0].id, 'p');
});

test('guardarWorkflow simula por omissao e envia o corpo preservado com --executar', async () => {
  const simulado = await cliente(fetchFalso([])).guardarWorkflow(W, { name: 'Novo' });
  assert.equal(simulado.simulado, true);
  assert.equal(simulado.corpo.allowMultiple, true);

  const f = fetchFalso([resposta(200, { ok: true })]);
  await cliente(f, new Guarda({ executar: true, permitidas: ['L1'], registar: silencio })).guardarWorkflow(W, { name: 'Novo' });
  const enviado = JSON.parse(f.chamadas[0].body);
  assert.equal(f.chamadas[0].method, 'PUT');
  assert.equal(enviado.name, 'Novo');
  assert.equal(enviado.allowMultiple, true);
  assert.equal(enviado.window.end, '23:00');
});

test('republicar leva updatedBy das claims do token', async () => {
  const f = fetchFalso([resposta(200, {})]);
  await cliente(f, new Guarda({ executar: true, permitidas: ['L1'], registar: silencio })).republicar('w1');
  assert.match(f.chamadas[0].url, /\/workflow\/L1\/change-status\/w1$/);
  assert.deepEqual(JSON.parse(f.chamadas[0].body), { status: 'published', updatedBy: 'U1' });
});

test('lerFicheiroDoMotor le o fileUrl', async () => {
  const f = fetchFalso([resposta(200, '{"templates":[{"body":"texto novo"}]}')]);
  assert.match(await lerFicheiroDoMotor({ fileUrl: 'https://storage.test/x' }, { fetchFn: f }), /texto novo/);
  assert.equal(await lerFicheiroDoMotor({}), null);
});

test('enroll-stats envia workflowIds como array', async () => {
  const f = fetchFalso([resposta(200, [])]);
  await cliente(f).inscricoes(['a', 'b']);
  const u = new URL(f.chamadas[0].url);
  assert.equal(u.pathname, '/workflows/status/search/enroll-stats');
  assert.deepEqual(u.searchParams.getAll('workflowIds[]'), ['a', 'b']);
});
