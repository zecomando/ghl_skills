import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EscritaBloqueada } from '../skills/ghl-scripts/scripts/lib/erros.mjs';
import { Guarda, garantirDaLocation, guardaDoArgv, locationsPermitidas } from '../skills/ghl-scripts/scripts/lib/guarda.mjs';
import { silencio } from './ajudas.mjs';

test('leituras passam sempre, mesmo sem location', () => {
  const g = new Guarda({ registar: silencio });
  assert.equal(g.decidir('GET', '/x', undefined), 'enviar');
  assert.equal(g.decidir('head', '/x', undefined), 'enviar');
  assert.equal(g.decidir('POST', '/contacts/search', 'L1', { leitura: true }), 'enviar');
});

test('sem --executar, uma escrita simula e diz que simulou', () => {
  const linhas = [];
  const g = new Guarda({ permitidas: ['L1'], registar: (m) => linhas.push(m) });
  assert.equal(g.decidir('PUT', '/x', 'L1'), 'simular');
  assert.match(linhas[0], /SIMULACAO/);
  assert.doesNotMatch(linhas[0], /ATENCAO/);
});

test('a simulacao avisa quando a location seria recusada', () => {
  const linhas = [];
  const g = new Guarda({ permitidas: ['L1'], registar: (m) => linhas.push(m) });
  assert.equal(g.decidir('POST', '/x', 'L2'), 'simular');
  assert.match(linhas[0], /nao esta em GHL_WRITE_LOCATIONS/);
});

test('com --executar, uma location fora da allowlist e recusada', () => {
  const g = new Guarda({ executar: true, permitidas: ['L1'], registar: silencio });
  assert.throws(() => g.decidir('POST', '/x', 'L2'), EscritaBloqueada);
});

test('allowlist vazia = nenhuma escrita passa', () => {
  const g = new Guarda({ executar: true, permitidas: locationsPermitidas(''), registar: silencio });
  assert.throws(() => g.decidir('DELETE', '/x', 'L1'), /lista vazia/);
});

test('uma escrita sem location e recusada, mesmo em simulacao', () => {
  const g = new Guarda({ registar: silencio });
  assert.throws(() => g.decidir('PATCH', '/x', ''), EscritaBloqueada);
});

test('com --executar e location autorizada, envia', () => {
  const g = new Guarda({ executar: true, permitidas: ['L1', 'L2'], registar: silencio });
  assert.equal(g.decidir('PUT', '/x', 'L2'), 'enviar');
});

test('guardaDoArgv so executa com a flag', () => {
  assert.equal(guardaDoArgv(['node', 'x.mjs']).executar, false);
  assert.equal(guardaDoArgv(['node', 'x.mjs', '--executar']).executar, true);
});

test('locationsPermitidas limpa espacos e entradas vazias', () => {
  assert.deepEqual([...locationsPermitidas(' a, b ,,c ')], ['a', 'b', 'c']);
});

test('garantirDaLocation confere o que o servidor diz', () => {
  const obj = { locationId: 'L1', nome: 'x' };
  assert.equal(garantirDaLocation(obj, 'L1'), obj);
  assert.equal(garantirDaLocation({ location_id: 'L1' }, 'L1').location_id, 'L1');
  assert.throws(() => garantirDaLocation({ locationId: 'L2' }, 'L1'), /ABORTADO/);
  assert.throws(() => garantirDaLocation({}, 'L1'), /sem locationId/);
  assert.throws(() => garantirDaLocation(undefined, 'L1'), EscritaBloqueada);
});
