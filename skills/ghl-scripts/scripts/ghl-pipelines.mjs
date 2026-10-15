#!/usr/bin/env node
/**
 * Pipelines e stages da location — SO LEITURA.
 *
 *   node ghl-pipelines.mjs                 lista pipelines e stages
 *   node ghl-pipelines.mjs --stage=<id>    diz a que pipeline pertence um stage
 *   node ghl-pipelines.mjs --json
 *
 * PORQUE EXISTE
 * Stages orfaos existem: um workflow em producao movia oportunidades para um
 * stage que nao pertencia a pipeline nenhum da conta — aterravam num sitio que
 * nenhum board mostra. Validar todo o stage id contra os pipelines lidos ANTES
 * de escrever; ao mover, enviar o `pipelineId` dono do stage.
 */

import { argumentos, carregarEnv, correrCli, exigir } from './lib/config.mjs';
import { criarClienteOficial, listarPipelines } from './lib/oficial.mjs';

await correrCli(async () => {
  const a = argumentos();
  carregarEnv();
  const cliente = criarClienteOficial({ token: exigir('GHL_PIT_LOCATION'), locationId: exigir('GHL_LOCATION_ID') });
  const pipelines = await listarPipelines(cliente);

  if (a.json) {
    console.log(JSON.stringify(pipelines, null, 2));
    return;
  }

  if (a.stage) {
    const id = String(a.stage);
    const dono = pipelines.find((p) => (p.stages ?? []).some((s) => s.id === id));
    if (!dono) {
      console.log(`ORFAO: nenhum dos ${pipelines.length} pipelines tem o stage ${id}.`);
      console.log('Uma oportunidade movida para ele nao aparece em board nenhum. Nao escrever com este id.');
      process.exitCode = 1;
      return;
    }
    const stage = dono.stages.find((s) => s.id === id);
    console.log(`Stage "${stage.name}" (${id}) pertence ao pipeline "${dono.name}" (${dono.id}).`);
    console.log('Ao mover uma oportunidade para ele: enviar pipelineId = o do dono + pipelineStageId.');
    return;
  }

  console.log(`${pipelines.length} pipelines\n`);
  for (const p of pipelines) {
    console.log(`${p.name}  (${p.id})`);
    for (const s of p.stages ?? []) console.log(`   ${String(s.position ?? '').padStart(2)}  ${s.name}  (${s.id})`);
    console.log();
  }
});
