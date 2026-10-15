#!/usr/bin/env node
/**
 * Procurar um contacto por telefone ou por id — SO LEITURA.
 *
 *   node ghl-contacto.mjs --telefone=+351900000000
 *   node ghl-contacto.mjs --id=<contactId> [--json]
 *
 * Armadilhas que isto ja trata:
 * - o telefone tem de vir em E.164; nunca se concatena prefixo (um
 *   "+351{{contact.phone}}" produziu "+351+351..." em dezenas de passos);
 * - o `+` vai percent-encoded na query (colado a mao vira espaco);
 * - `search/duplicate` devolve um contacto "slim" sem dnd/dndSettings, e a
 *   leitura por id omite-os quando nunca foram definidos (medido 2026-10-15):
 *   o DND completa-se pela pesquisa (POST /contacts/search filtrando por id);
 * - `GET /contacts/{id}` nao filtra por location: confere-se na resposta.
 */

import { E164, argumentos, carregarEnv, correrCli, exigir } from './lib/config.mjs';
import { criarClienteOficial, dndPorCanal, lerContacto, procurarPorTelefone } from './lib/oficial.mjs';

await correrCli(async () => {
  const a = argumentos();
  if (!a.telefone && !a.id) {
    console.log('Uso: node ghl-contacto.mjs --telefone=+351900000000 | --id=<contactId> [--json]');
    return;
  }
  carregarEnv();
  const cliente = criarClienteOficial({ token: exigir('GHL_PIT_LOCATION'), locationId: exigir('GHL_LOCATION_ID') });

  let contacto;
  if (a.telefone) {
    const tel = String(a.telefone).trim();
    if (!E164.test(tel)) {
      throw new Error(`"${tel}" nao esta em E.164 (ex.: +351900000000). Corrigir o valor — nunca concatenar prefixo.`);
    }
    contacto = await procurarPorTelefone(cliente, tel);
  } else {
    contacto = await lerContacto(cliente, String(a.id));
  }

  if (!contacto) {
    console.log('Nenhum contacto com esse telefone nesta location.');
    return;
  }
  if (a.json) {
    console.log(JSON.stringify(contacto, null, 2));
    return;
  }

  const nome = contacto.contactName || [contacto.firstName, contacto.lastName].filter(Boolean).join(' ') || '(sem nome)';
  const dnd = dndPorCanal(contacto);
  console.log(`Contacto ${contacto.id}`);
  console.log(`  nome       ${nome}`);
  if (contacto.companyName) console.log(`  empresa    ${contacto.companyName}`);
  console.log(`  telefone   ${contacto.phone ?? '-'}${contacto.phone && !E164.test(contacto.phone) ? '   ** nao esta em E.164 **' : ''}`);
  console.log(`  email      ${contacto.email ?? '-'}`);
  console.log(`  tags       ${(contacto.tags ?? []).join(', ') || '-'}`);
  if (dnd.desconhecido) {
    console.log('  DND        DESCONHECIDO (payload sem dnd/dndSettings) — desconhecido bloqueia o envio');
  } else {
    const activos = Object.entries(dnd.canais).filter(([, v]) => v).map(([k]) => k);
    console.log(`  DND        por canal: ${activos.join(', ') || 'nenhum'}   (booleano dnd=${dnd.dndBooleano} — nao e prova)`);
  }
  console.log(`  location   ${contacto.locationId ?? '-'}`);
});
