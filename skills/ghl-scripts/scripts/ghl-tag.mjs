#!/usr/bin/env node
/**
 * Por ou tirar uma tag a um contacto — o EXEMPLO COMPLETO de uma escrita segura.
 *
 *   node ghl-tag.mjs --contacto=<id> --adicionar="nome da tag"            simula
 *   node ghl-tag.mjs --contacto=<id> --remover="nome da tag" --executar   escreve
 *
 * O padrao que qualquer script de escrita deve seguir:
 *   1. ler o objecto ao servidor;
 *   2. garantirDaLocation(): o servidor confirma que o objecto e desta location
 *      (um id de outra sub-conta nao da 400 — da 200 na conta errada);
 *   3. nada a fazer? sair sem escrever (idempotente);
 *   4. escrever pela guarda: sem --executar simula; com --executar so passa se
 *      a location estiver em GHL_WRITE_LOCATIONS;
 *   5. RELER e confirmar — um 200 nao e prova. As tags comparam-se em
 *      minusculas (o GHL guarda-as assim) e vao por NOME, nunca por id.
 */

import { argumentos, carregarEnv, correrCli, exigir } from './lib/config.mjs';
import { garantirDaLocation, guardaDoArgv } from './lib/guarda.mjs';
import { criarClienteOficial, lerContacto } from './lib/oficial.mjs';

await correrCli(async () => {
  const a = argumentos();
  const nome = String(a.adicionar ?? a.remover ?? '').trim();
  if (!a.contacto || !nome || (a.adicionar && a.remover)) {
    console.log('Uso: node ghl-tag.mjs --contacto=<id> (--adicionar="tag" | --remover="tag") [--executar]');
    return;
  }
  const adicionar = Boolean(a.adicionar);
  carregarEnv();
  const loc = exigir('GHL_LOCATION_ID');
  const cliente = criarClienteOficial({ token: exigir('GHL_PIT_LOCATION'), locationId: loc, guarda: guardaDoArgv() });
  const id = String(a.contacto);
  const alvo = nome.toLowerCase();
  const temTag = (c) => (c?.tags ?? []).map((t) => String(t).toLowerCase()).includes(alvo);

  // 1 + 2
  const contacto = garantirDaLocation(await lerContacto(cliente, id), loc, `contacto ${id}`);
  console.log(`Contacto ${id}: tags actuais = ${(contacto.tags ?? []).join(', ') || '(nenhuma)'}`);

  // 3
  if (adicionar === temTag(contacto)) {
    console.log(`Nada a fazer: o contacto ${adicionar ? 'ja tem' : 'nao tem'} a tag "${nome}".`);
    return;
  }

  // 4
  const caminho = `/contacts/${encodeURIComponent(id)}/tags`;
  const resultado = adicionar
    ? await cliente.post(caminho, { corpo: { tags: [nome] } })
    : await cliente.delete(caminho, { corpo: { tags: [nome] } });
  if (resultado?.simulado) {
    console.log(`Nada foi enviado. Para ${adicionar ? 'adicionar' : 'remover'} de facto: --executar (com a location em GHL_WRITE_LOCATIONS).`);
    return;
  }

  // 5
  const depois = await lerContacto(cliente, id);
  if (adicionar === temTag(depois)) {
    console.log(`VERIFICADO por releitura: a tag "${nome}" ${adicionar ? 'esta' : 'ja nao esta'} no contacto.`);
  } else {
    console.log('FALSO VERDE: a API respondeu OK mas a releitura nao confirma a mudanca. Investigar antes de repetir.');
    process.exitCode = 1;
  }
});
