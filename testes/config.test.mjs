import assert from 'node:assert/strict';
import { test } from 'node:test';
import { E164, argumentos, exigir } from '../skills/ghl-scripts/scripts/lib/config.mjs';
import { ErroAuth, ErroPedido, classificar, explicar } from '../skills/ghl-scripts/scripts/lib/erros.mjs';
import { comAmbiente } from './ajudas.mjs';

test('argumentos le --chave=valor, --flag e posicionais', () => {
  assert.deepEqual(argumentos(['--telefone=+351900000000', '--executar', 'x', '--texto=a=b']), {
    _: ['x'],
    telefone: '+351900000000',
    executar: true,
    texto: 'a=b',
  });
});

test('E164 aceita o formato internacional e recusa prefixo duplicado', () => {
  assert.ok(E164.test('+351900000000'));
  assert.ok(!E164.test('900000000'));
  assert.ok(!E164.test('+351+351900000000'));
});

test('exigir explica como obter a variavel em falta', () =>
  comAmbiente({ GHL_LOCATION_ID: undefined }, () => {
    assert.throws(() => exigir('GHL_LOCATION_ID'), /location\/<ID>/);
  }));

test('classificar: 401/403 e token, o resto e pedido', () => {
  assert.ok(classificar(401, 'x') instanceof ErroAuth);
  assert.ok(classificar(403, 'x') instanceof ErroAuth);
  assert.ok(classificar(422, 'x') instanceof ErroPedido);
  assert.ok(classificar(404, 'x') instanceof ErroPedido);
  assert.match(explicar(classificar(422, 'x')), /autenticacao passou/);
});

test('401 "version header was not found." nao e problema de token', () => {
  const e = classificar(401, 'version header was not found.');
  assert.ok(e instanceof ErroPedido);
  assert.match(e.dica(), /Falta o header Version/);
  assert.ok(classificar(401, 'Invalid JWT') instanceof ErroAuth);
});
