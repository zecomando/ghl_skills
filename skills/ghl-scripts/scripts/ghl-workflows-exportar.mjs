#!/usr/bin/env node
/**
 * Exportar todos os workflows da location (definicao + triggers) — SO LEITURA.
 *
 *   node ghl-workflows-exportar.mjs [--saida=ghl-export]
 *
 * Gera, dentro de <saida>/workflows-<location>-<data>/:
 *   workflows/<id>-<nome>.json   formato canonico { workflowData, triggers }
 *   lista.json                   a listagem crua
 *   inventario.md                o que se le para decidir (estado, passos, triggers)
 *
 * PORQUE A API INTERNA: a oficial so devolve 7 campos de metadados por
 * workflow — sem passos, sem triggers. E os triggers NAO vem no GET do
 * workflow: tem endpoint proprio (quem exporta so o workflow perde o "quando").
 *
 * ⚠️ OS EXPORTS TRAZEM SEGREDOS VIVOS em texto limpo (tokens em passos de
 * webhook). A pasta de saida nunca vai para o Git.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { argumentos, carregarEnv, correrCli, exigir } from './lib/config.mjs';
import { criarClienteInterno } from './lib/interna.mjs';
import { obterTokenSessao } from './lib/sessao.mjs';

const slug = (s) =>
  (s || 'sem-nome')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

const passosDe = (w) => w?.workflowData?.templates ?? w?.templates ?? [];

function avisarSeNaoIgnorada(pasta) {
  if (!existsSync('.git')) return;
  const ignorada = existsSync('.gitignore') && readFileSync('.gitignore', 'utf8').split(/\r?\n/).some((l) => l.trim().replace(/\/$/, '') === pasta.replace(/\/$/, ''));
  if (!ignorada) {
    console.log(`\n  AVISO: "${pasta}/" nao esta no .gitignore deste projecto. Os exports trazem tokens vivos.`);
    console.log(`         Acrescenta a linha  ${pasta}/  ao .gitignore antes de qualquer commit.\n`);
  }
}

await correrCli(async () => {
  const a = argumentos();
  carregarEnv();
  const loc = exigir('GHL_LOCATION_ID');
  const saidaBase = String(a.saida ?? 'ghl-export');
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const pasta = join(saidaBase, `workflows-${loc}-${carimbo}`);
  avisarSeNaoIgnorada(saidaBase);

  const cliente = criarClienteInterno({ token: await obterTokenSessao(), locationId: loc });
  console.log(`A listar workflows da location ${loc}...`);
  const lista = await cliente.listarWorkflows();
  console.log(`${lista.length} workflows.\n`);

  await mkdir(join(pasta, 'workflows'), { recursive: true });
  await writeFile(join(pasta, 'lista.json'), JSON.stringify(lista, null, 2));

  const linhas = [];
  const tiposDePasso = new Map();
  for (const [i, item] of lista.entries()) {
    const id = item._id ?? item.id;
    process.stdout.write(`[${i + 1}/${lista.length}] ${item.name} ... `);
    try {
      const w = await cliente.lerWorkflow(id);
      const triggers = await cliente.lerTriggers(id);
      await writeFile(join(pasta, 'workflows', `${id}-${slug(item.name)}.json`), JSON.stringify({ workflowData: w, triggers }, null, 2));
      const passos = passosDe(w);
      const tipos = [...new Set(passos.map((p) => p.type).filter(Boolean))].sort();
      for (const t of tipos) tiposDePasso.set(t, (tiposDePasso.get(t) ?? 0) + 1);
      linhas.push({
        id,
        nome: item.name,
        estado: w?.status ?? item.status,
        passos: passos.length,
        triggers: triggers.length,
        tiposTrigger: [...new Set(triggers.map((t) => t.type).filter(Boolean))].sort(),
        allowMultiple: w?.allowMultiple,
      });
      console.log(`${passos.length} passos, ${triggers.length} triggers`);
    } catch (e) {
      console.log(`FALHOU: ${String(e.message).split('\n')[0]}`);
      linhas.push({ id, nome: item.name, erro: String(e.message).split('\n')[0] });
    }
  }

  const bons = linhas.filter((l) => !l.erro);
  const falhas = linhas.filter((l) => l.erro);
  const md = [
    `# Inventario de workflows — location \`${loc}\``,
    '',
    `Exportado a ${new Date().toISOString()} · ${bons.length} workflows lidos · ${falhas.length} falhas`,
    '',
    '> ⚠️ Esta pasta contem segredos vivos (tokens em passos de webhook). Nunca a versionar nem partilhar.',
    '',
    '| Workflow | Estado | Passos | Triggers | Tipos de trigger | allowMultiple |',
    '|---|---|---|---|---|---|',
    ...bons.map((l) => `| ${l.nome} | ${l.estado ?? '-'} | ${l.passos} | ${l.triggers} | ${l.tiposTrigger.join(', ') || '—'} | ${l.allowMultiple ?? '-'} |`),
    '',
    'Workflows publicados sem triggers so correm para quem for inscrito; `allowMultiple: false` cala o',
    'workflow a partir da 2.a inscricao do mesmo contacto (ver a skill ghl-api-interna).',
    '',
    '## Tipos de passo (em quantos workflows aparecem)',
    '',
    ...[...tiposDePasso.entries()].sort((x, y) => y[1] - x[1]).map(([t, n]) => `- \`${t}\` — ${n}`),
    '',
    ...(falhas.length ? ['## Falhas', '', ...falhas.map((l) => `- ${l.nome} (\`${l.id}\`): ${l.erro}`), ''] : []),
  ].join('\n');
  await writeFile(join(pasta, 'inventario.md'), md);

  console.log(`\nFeito: ${pasta}`);
  console.log('Ler primeiro o inventario.md. Lembrete: esta pasta tem segredos — fora do Git.');
  if (falhas.length) process.exitCode = 1;
});
