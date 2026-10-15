import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Guarda } from '../skills/ghl-scripts/scripts/lib/guarda.mjs';
import {
  criarClienteOficial,
  dndPorCanal,
  lerContacto,
  listarPipelines,
  procurarPorTelefone,
  versaoPara,
} from '../skills/ghl-scripts/scripts/lib/oficial.mjs';
import { fetchFalso, resposta, semEspera, silencio } from './ajudas.mjs';

const cliente = (f, guarda = new Guarda({ registar: silencio })) =>
  criarClienteOficial({ token: 'TOKEN', locationId: 'L1', fetchFn: f, esperar: semEspera, guarda });

test('versaoPara segue a matriz medida', () => {
  assert.equal(versaoPara('/calendars/abc/free-slots'), '2021-04-15');
  assert.equal(versaoPara('/calendars/events?startTime=1'), '2021-04-15');
  assert.equal(versaoPara('/calendars/events/appointments/1'), 'v3');
  assert.equal(versaoPara('/calendars/'), '2021-07-28');
  assert.equal(versaoPara('/contacts/123'), 'v3');
  assert.equal(versaoPara('/contacts/upsert'), 'v3');
  assert.equal(versaoPara('/contacts/123/workflow/w1'), '2021-07-28');
  assert.equal(versaoPara('/conversations/messages'), 'v3');
  assert.equal(versaoPara('/opportunities/search'), '2021-07-28');
  assert.equal(versaoPara('/locations/L1/tags'), '2021-07-28');
  assert.equal(versaoPara('/qualquer/coisa'), '2021-07-28');
});

test('o cliente envia Authorization e o Version certo', async () => {
  const f = fetchFalso([resposta(200, { contact: { id: 'c1', locationId: 'L1' } })]);
  const c = await lerContacto(cliente(f), 'c1');
  assert.equal(c.id, 'c1');
  assert.equal(f.chamadas[0].headers.Authorization, 'Bearer TOKEN');
  assert.equal(f.chamadas[0].headers.Version, 'v3');
  assert.equal(f.chamadas[0].url, 'https://services.leadconnectorhq.com/contacts/c1');
});

test('uma escrita sem --executar nao toca na rede', async () => {
  const f = fetchFalso([]);
  const r = await cliente(f, new Guarda({ permitidas: ['L1'], registar: silencio })).post('/contacts/c1/tags', { corpo: { tags: ['x'] } });
  assert.equal(r.simulado, true);
  assert.equal(f.chamadas.length, 0);
});

test('com --executar e a location autorizada, a escrita sai', async () => {
  const f = fetchFalso([resposta(201, { tags: ['x'] })]);
  const r = await cliente(f, new Guarda({ executar: true, permitidas: ['L1'], registar: silencio })).post('/contacts/c1/tags', { corpo: { tags: ['x'] } });
  assert.deepEqual(r, { tags: ['x'] });
  assert.equal(f.chamadas[0].method, 'POST');
});

test('com --executar e a location fora da lista, nada sai', async () => {
  const f = fetchFalso([]);
  await assert.rejects(cliente(f, new Guarda({ executar: true, permitidas: ['OUTRA'], registar: silencio })).put('/contacts/c1', { corpo: {} }), /GHL_WRITE_LOCATIONS/);
  assert.equal(f.chamadas.length, 0);
});

test('POST /contacts/search marcado como leitura passa sem --executar', async () => {
  const f = fetchFalso([resposta(200, { contacts: [] })]);
  const r = await cliente(f).post('/contacts/search', { corpo: {}, leitura: true });
  assert.deepEqual(r, { contacts: [] });
});

test('lerContacto recusa um contacto de outra location', async () => {
  const f = fetchFalso([resposta(200, { contact: { id: 'c1', locationId: 'OUTRA' } })]);
  await assert.rejects(lerContacto(cliente(f), 'c1'), /nao da L1/);
});

test('procurarPorTelefone codifica o + e rele por id (o duplicate e slim)', async () => {
  const f = fetchFalso([
    resposta(200, { contact: { id: 'c1' } }),
    resposta(200, { contact: { id: 'c1', locationId: 'L1', dnd: false, dndSettings: { SMS: { status: 'active' }, Email: { status: 'inactive' } } } }),
  ]);
  const c = await procurarPorTelefone(cliente(f), '+351900000000');
  assert.equal(f.chamadas.length, 2);
  assert.match(f.chamadas[0].url, /number=%2B351900000000/);
  assert.deepEqual(dndPorCanal(c), { desconhecido: false, dndBooleano: false, canais: { SMS: true, Email: false } });
});

test('procurarPorTelefone sem resultado devolve null', async () => {
  const f = fetchFalso([resposta(200, { contact: null })]);
  assert.equal(await procurarPorTelefone(cliente(f), '+351900000000'), null);
});

test('dndPorCanal: sem dnd nem dndSettings e desconhecido (e bloqueia)', () => {
  assert.equal(dndPorCanal({ id: 'x' }).desconhecido, true);
  assert.equal(dndPorCanal(null).desconhecido, true);
});

test('listarPipelines devolve a lista', async () => {
  const f = fetchFalso([resposta(200, { pipelines: [{ id: 'p1', stages: [{ id: 's1' }] }] })]);
  const p = await listarPipelines(cliente(f));
  assert.equal(p[0].stages[0].id, 's1');
  assert.match(f.chamadas[0].url, /locationId=L1/);
  assert.equal(f.chamadas[0].headers.Version, '2021-07-28');
});
