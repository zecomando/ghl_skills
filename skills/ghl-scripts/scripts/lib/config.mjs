/**
 * Configuracao comum: o .env da pasta de trabalho, argumentos e variaveis
 * obrigatorias que explicam como se obtem quando faltam.
 *
 * Os scripts correm a partir do projecto do utilizador (a pasta onde esta o
 * .env), nao a partir da pasta da skill. Por isso o .env le-se do directorio
 * actual — ou do caminho em GHL_ENV_FILE.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ErroConfig, explicar } from './erros.mjs';

/** Como se obtem cada variavel. Aparece quando falta — falhar cedo e explicar. */
export const COMO_OBTER = {
  GHL_LOCATION_ID:
    'O id da sub-conta (location). Esta no URL do GHL: .../location/<ID>/...',
  GHL_PIT_LOCATION:
    'Private Integration Token da sub-conta: GHL > (sub-conta) Settings > Private Integrations >\n' +
    'Create new integration, so com os scopes necessarios. Tambem aceita um access token OAuth.',
  GHL_WRITE_LOCATIONS:
    'Lista, separada por virgulas, das locations onde a escrita e permitida.\n' +
    'Vazia = nenhuma escrita passa (e o comportamento certo por omissao).',
  GHL_REFRESH_TOKEN:
    'Uma vez, pela pessoa dona da conta, com sessao iniciada no GHL:\n' +
    '  DevTools (F12) > Application > IndexedDB > firebaseLocalStorageDb > firebaseLocalStorage\n' +
    '  > entrada "firebase:authUser:..." > value.stsTokenManager.refreshToken\n' +
    'Vale por uma sessao inteira: tratar como uma password. Ver a skill ghl-auth-interna.',
  GHL_FIREBASE_KEY:
    'Na mesma entrada do IndexedDB (ver GHL_REFRESH_TOKEN): value.apiKey.\n' +
    'E a chave web publica do Firebase do GHL (projecto highlevel-backend), nao e um segredo.',
};

/**
 * Carrega o .env da pasta actual (ou GHL_ENV_FILE). Nao falha se nao existir:
 * as variaveis podem vir do ambiente.
 */
export function carregarEnv() {
  const ficheiro = resolve(process.env.GHL_ENV_FILE || '.env');
  if (!existsSync(ficheiro)) return null;
  if (typeof process.loadEnvFile !== 'function') {
    throw new ErroConfig('Este kit precisa de Node 20.12 ou mais recente (process.loadEnvFile). Ver: node --version');
  }
  process.loadEnvFile(ficheiro);
  return ficheiro;
}

/** Le uma variavel obrigatoria ou aborta com instrucoes de como a obter. */
export function exigir(nome) {
  const valor = (process.env[nome] || '').trim();
  if (!valor) {
    throw new ErroConfig(`Falta ${nome} (no .env da pasta de trabalho ou no ambiente).\n${COMO_OBTER[nome] ?? ''}`.trim());
  }
  return valor;
}

/** Le uma variavel opcional. */
export function opcional(nome, omissao = '') {
  const valor = (process.env[nome] || '').trim();
  return valor || omissao;
}

/**
 * Argumentos no formato --chave=valor e --flag. O resto vai para `_`.
 * Ex.: --telefone=+351900000000 --executar  ->  { telefone: '+351900000000', executar: true, _: [] }
 */
export function argumentos(argv = process.argv.slice(2)) {
  const saida = { _: [] };
  for (const a of argv) {
    if (!a.startsWith('--')) {
      saida._.push(a);
      continue;
    }
    const i = a.indexOf('=');
    if (i === -1) saida[a.slice(2)] = true;
    else saida[a.slice(2, i)] = a.slice(i + 1);
  }
  return saida;
}

/** E.164 generico. Para um pais concreto, apertar (ex.: Portugal ^\+351\d{9}$). */
export const E164 = /^\+[1-9]\d{7,14}$/;

/** Corre o main de um CLI com mensagens de erro legiveis e codigo de saida. */
export async function correrCli(main) {
  try {
    await main();
  } catch (erro) {
    console.error(`\nERRO: ${explicar(erro)}`);
    process.exitCode = 1;
  }
}
