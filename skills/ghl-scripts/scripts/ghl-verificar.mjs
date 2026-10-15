#!/usr/bin/env node
/**
 * Diagnostico da configuracao e das credenciais — SO LEITURAS, nao escreve nada.
 *
 *   node ghl-verificar.mjs
 *
 * Corre a partir da pasta do projecto (onde esta o .env). Confere:
 *   1. versao do Node e o .env
 *   2. GHL_LOCATION_ID
 *   3. API oficial: GHL_PIT_LOCATION le a sub-conta? (GET /locations/{id})
 *   4. API interna: o refresh token renova? a API do editor responde?
 *   5. GHL_WRITE_LOCATIONS: onde a escrita e permitida
 *
 * Nunca imprime tokens.
 */

import { COMO_OBTER, carregarEnv, correrCli, opcional } from './lib/config.mjs';
import { explicar } from './lib/erros.mjs';
import { locationsPermitidas } from './lib/guarda.mjs';
import { BASE_WORKFLOW, criarClienteInterno } from './lib/interna.mjs';
import { criarClienteOficial } from './lib/oficial.mjs';
import { caminhoCache, lerClaims, obterTokenSessao, utilizadorDoToken } from './lib/sessao.mjs';

const ok = (m) => console.log(`  OK     ${m}`);
const info = (m) => console.log(`  INFO   ${m}`);
const falta = (m) => console.log(`  FALTA  ${m}`);
const erro = (m) => console.log(`  ERRO   ${m.replace(/\n/g, '\n         ')}`);

await correrCli(async () => {
  let problemas = 0;
  console.log('Kit GHL — verificacao (so leituras)\n');

  const [maior, menor] = process.versions.node.split('.').map(Number);
  if (maior > 20 || (maior === 20 && menor >= 12)) ok(`Node ${process.versions.node}`);
  else {
    erro(`Node ${process.versions.node} — este kit precisa de 20.12 ou mais recente`);
    problemas++;
  }

  const env = carregarEnv();
  if (env) ok(`.env carregado: ${env}`);
  else info('sem .env na pasta actual — a usar so variaveis de ambiente');

  const loc = opcional('GHL_LOCATION_ID');
  if (loc) ok(`GHL_LOCATION_ID = ${loc}`);
  else {
    falta(`GHL_LOCATION_ID — ${COMO_OBTER.GHL_LOCATION_ID}`);
    problemas++;
  }

  console.log('\nAPI oficial (e servidor MCP oficial)');
  const pit = opcional('GHL_PIT_LOCATION');
  if (!pit) falta('GHL_PIT_LOCATION — sem ele, a API oficial e o MCP oficial nao funcionam');
  else if (loc) {
    try {
      const c = criarClienteOficial({ token: pit, locationId: loc });
      const d = await c.get(`/locations/${encodeURIComponent(loc)}`);
      ok(`token aceite; sub-conta: ${d?.location?.name ?? d?.name ?? '(sem nome)'}`);
    } catch (e) {
      erro(explicar(e));
      problemas++;
    }
  }

  console.log('\nAPI interna (token de sessao)');
  if (!opcional('GHL_REFRESH_TOKEN') && !opcional('GHL_TOKEN')) {
    info('sem GHL_REFRESH_TOKEN — so e preciso para a API interna (workflows, bots). Ver a skill ghl-auth-interna.');
  } else {
    try {
      const token = await obterTokenSessao();
      const claims = lerClaims(token);
      const minutos = claims?.exp ? Math.round((claims.exp * 1000 - Date.now()) / 60000) : '?';
      ok(`sessao valida por mais ${minutos} min (utilizador ${utilizadorDoToken(token) ?? '?'})`);
      info(`cache do token: ${caminhoCache()} (fora do projecto, de proposito)`);
      if (loc) {
        const ci = criarClienteInterno({ token, locationId: loc });
        const d = await ci.pedido('GET', BASE_WORKFLOW, `${encodeURIComponent(loc)}/list`, {
          query: { type: 'workflow', limit: 1, offset: 0 },
        });
        ok(`API interna responde; workflows nesta location: ${d?.count ?? '?'}`);
      }
    } catch (e) {
      erro(explicar(e));
      problemas++;
    }
  }

  console.log('\nEscrita');
  const permitidas = locationsPermitidas();
  if (!permitidas.size) info('GHL_WRITE_LOCATIONS vazia: nenhuma escrita passa (so leituras e simulacao).');
  else {
    ok(`escrita permitida em: ${[...permitidas].join(', ')}`);
    if (loc && !permitidas.has(loc)) info('GHL_LOCATION_ID nao esta em GHL_WRITE_LOCATIONS: os scripts simulam mas recusam --executar.');
  }
  info('Os scripts so escrevem com --executar; sem ele, mostram o que fariam.');

  console.log(problemas ? `\n${problemas} problema(s) a resolver.` : '\nTudo certo.');
  if (problemas) process.exitCode = 1;
});
