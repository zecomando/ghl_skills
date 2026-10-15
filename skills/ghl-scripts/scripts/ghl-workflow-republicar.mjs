#!/usr/bin/env node
/**
 * Confirmar que o MOTOR executa o que esta gravado num workflow — e
 * republicar quando ficou para tras.
 *
 *   node ghl-workflow-republicar.mjs --workflow=<id> --esperado="texto novo" [--proibido="texto antigo"]
 *   ... --executar      republica se o motor estiver desactualizado
 *
 * A ARMADILHA MAIS CARA
 * Editar um workflow publicado por PUT grava, devolve `status: published`, e a
 * releitura mostra o texto novo. Parece feito. Nao esta: o motor nao le o
 * documento, le o ficheiro em `fileUrl`, que fica UMA VERSAO ATRAS ate se
 * republicar (`PUT change-status` com `updatedBy`). Num caso real, uma lead
 * recebeu o texto antigo horas depois de uma edicao "confirmada".
 *
 * A prova valida e procurar o texto no ficheiro do motor — e isso que isto faz.
 * Nota: o texto de um template WhatsApp aprovado vive na Meta; nem o documento
 * nem o motor o mostram.
 */

import { argumentos, carregarEnv, correrCli, exigir } from './lib/config.mjs';
import { garantirDaLocation, guardaDoArgv } from './lib/guarda.mjs';
import { dormir } from './lib/http.mjs';
import { criarClienteInterno, lerFicheiroDoMotor } from './lib/interna.mjs';
import { obterTokenSessao } from './lib/sessao.mjs';

await correrCli(async () => {
  const a = argumentos();
  const id = a.workflow ? String(a.workflow) : '';
  const esperado = typeof a.esperado === 'string' ? a.esperado : '';
  const proibido = typeof a.proibido === 'string' ? a.proibido : '';
  if (!id || !esperado) {
    console.log('Uso: node ghl-workflow-republicar.mjs --workflow=<id> --esperado="texto novo" [--proibido="texto antigo"] [--executar]');
    return;
  }
  carregarEnv();
  const loc = exigir('GHL_LOCATION_ID');
  const cliente = criarClienteInterno({ token: await obterTokenSessao(), locationId: loc, guarda: guardaDoArgv() });
  const confere = (texto) => texto != null && texto.includes(esperado) && !(proibido && texto.includes(proibido));

  const w = garantirDaLocation(await cliente.lerWorkflow(id, { completar: false }), loc, `workflow ${id}`);
  if (!w?.workflowData?.templates) {
    console.log('Este workflow nao traz os passos no documento (vivem so no ficheiro): nao ha duas versoes para comparar.');
    return;
  }
  const docOk = confere(JSON.stringify(w.workflowData));
  const motor = await lerFicheiroDoMotor(w);
  const motorOk = confere(motor);

  console.log(`${w.name}  [${w.status}] v${w.version}`);
  console.log(`  documento  ${docOk ? 'tem o texto esperado' : '** NAO tem o texto esperado **'}`);
  const estadoMotor =
    motor == null ? 'nao consegui ler o ficheiro (fileUrl)'
      : motorOk ? 'em dia'
      : docOk ? '** DESACTUALIZADO — o que corre e a versao anterior **'
      : 'tambem nao tem o texto esperado';
  console.log(`  motor      ${estadoMotor}`);

  if (!docOk) {
    console.log('\nO documento nao tem o texto: a edicao nao foi gravada (ou o texto vive noutro sitio, ex.: um template Meta).');
    console.log('Republicar nao resolve isto.');
    process.exitCode = 1;
    return;
  }
  if (motorOk) {
    console.log('\nNada a fazer.');
    return;
  }
  if (motor == null) {
    process.exitCode = 1;
    return;
  }
  if (w.status !== 'published') {
    console.log('\nO workflow nao esta publicado. Publicar activa-o — e uma decisao, nao uma correccao. Fazer na UI ou por ordem explicita.');
    process.exitCode = 1;
    return;
  }

  const r = await cliente.republicar(id);
  if (r?.simulado) {
    console.log('\nNada foi enviado. Para republicar: --executar (com a location em GHL_WRITE_LOCATIONS).');
    return;
  }

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await dormir(2000);
    const depois = await cliente.lerWorkflow(id, { completar: false });
    if (confere(await lerFicheiroDoMotor(depois))) {
      console.log(`\nVERIFICADO: o motor passou a ter o texto novo (v${depois.version}).`);
      return;
    }
  }
  console.log('\nRepublicado, mas o ficheiro do motor ainda nao tem o texto novo. Voltar a verificar daqui a pouco, sem republicar outra vez as cegas.');
  process.exitCode = 1;
});
