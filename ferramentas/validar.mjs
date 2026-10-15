#!/usr/bin/env node
/**
 * Valida o repositorio antes de publicar — sem rede, sem dependencias.
 *
 *   node ferramentas/validar.mjs
 *
 * 1. Cada skills/<nome>/SKILL.md cumpre a especificacao Agent Skills
 *    (agentskills.io): frontmatter so com os seis campos da especificacao,
 *    `name` igual a pasta (algumas ferramentas descartam a skill em silencio
 *    quando nao e), description entre 1 e 1024 caracteres, sem BOM.
 * 2. Links relativos nos .md apontam para ficheiros que existem, e cada
 *    `ghl-...` citado entre crases e uma skill que existe.
 * 3. Nada com cara de segredo ou dado pessoal: tokens, chaves, JWT, emails,
 *    numeros de telefone reais. Os exemplos usam +351900000000 ou digitos X.
 *
 * Sai com codigo 1 se houver erros.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAMPOS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const IGNORAR = new Set(['.git', 'node_modules', 'ghl-export', 'make-export']);
const TEXTO = /\.(md|mjs|js|json|toml|ya?ml|txt|example)$|^\.(gitignore|gitattributes|env\.example)$|^(LICENSE)$/;

const erros = [];
const avisos = [];
const rel = (p) => relative(RAIZ, p).replace(/\\/g, '/');

function ficheiros(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...ficheiros(p));
    else saida.push(p);
  }
  return saida;
}

/** Frontmatter YAML simples: `chave: valor` e um nivel de mapa (metadata). */
function lerFrontmatter(texto, ficheiro) {
  if (texto.charCodeAt(0) === 0xfeff) erros.push(`${ficheiro}: tem BOM no inicio — o frontmatter deixa de ser reconhecido`);
  const m = texto.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) {
    erros.push(`${ficheiro}: falta o frontmatter (--- ... ---) no inicio`);
    return null;
  }
  const campos = {};
  let mapa = null;
  for (const linha of m[1].split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const aninhada = linha.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (aninhada && mapa) {
      mapa[aninhada[1]] = aninhada[2];
      continue;
    }
    const topo = linha.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!topo) {
      erros.push(`${ficheiro}: linha de frontmatter nao reconhecida: "${linha}"`);
      continue;
    }
    const [, chave, valorCru] = topo;
    if (valorCru === '') {
      mapa = {};
      campos[chave] = mapa;
      continue;
    }
    mapa = null;
    const citado = /^(["']).*\1$/.test(valorCru);
    if (!citado && (/: /.test(valorCru) || / #/.test(valorCru) || /^[\[{>|*&!%@`]/.test(valorCru))) {
      erros.push(`${ficheiro}: o valor de "${chave}" tem caracteres especiais de YAML (": ", " #", ...) — por entre aspas`);
    }
    campos[chave] = citado ? valorCru.slice(1, -1) : valorCru;
  }
  return campos;
}

// ------------------------------------------------------------------ 1. skills
const pastaSkills = join(RAIZ, 'skills');
const skills = readdirSync(pastaSkills).filter((n) => statSync(join(pastaSkills, n)).isDirectory());
for (const nome of skills) {
  const ficheiro = join(pastaSkills, nome, 'SKILL.md');
  const f = rel(ficheiro);
  if (!existsSync(ficheiro)) {
    erros.push(`${f}: nao existe`);
    continue;
  }
  const texto = readFileSync(ficheiro, 'utf8');
  const c = lerFrontmatter(texto, f);
  if (!c) continue;
  for (const k of Object.keys(c)) if (!CAMPOS.has(k)) erros.push(`${f}: campo "${k}" fora da especificacao (so ${[...CAMPOS].join(', ')})`);
  if (!c.name) erros.push(`${f}: falta name`);
  else {
    if (c.name !== nome) erros.push(`${f}: name "${c.name}" diferente da pasta "${nome}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.name) || c.name.length > 64) erros.push(`${f}: name invalido (a-z, 0-9, hifens simples, ate 64)`);
  }
  if (!c.description) erros.push(`${f}: falta description`);
  else if (c.description.length > 1024) erros.push(`${f}: description com ${c.description.length} caracteres (maximo 1024)`);
  if (typeof c.compatibility === 'string' && c.compatibility.length > 500) erros.push(`${f}: compatibility com mais de 500 caracteres`);
  if (c.metadata !== undefined && (typeof c.metadata !== 'object' || Array.isArray(c.metadata))) erros.push(`${f}: metadata tem de ser um mapa`);
  const linhas = texto.split('\n').length;
  if (linhas > 500) avisos.push(`${f}: ${linhas} linhas (a especificacao recomenda menos de 500 — mover detalhe para references/)`);
}

// ------------------------------------------------------- 2. links e referencias
const todos = ficheiros(RAIZ);
const markdown = todos.filter((p) => p.endsWith('.md'));
for (const p of markdown) {
  const texto = readFileSync(p, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, alvo] of texto.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(alvo)) continue;
    const caminho = resolve(dirname(p), decodeURIComponent(alvo.split('#')[0]));
    if (!existsSync(caminho)) erros.push(`${rel(p)}: link para "${alvo}" que nao existe`);
  }
  for (const [, citada] of texto.matchAll(/`(ghl-[a-z-]+)`/g)) {
    if (!skills.includes(citada)) erros.push(`${rel(p)}: cita a skill \`${citada}\`, que nao existe`);
  }
}

// ------------------------------------------------- 3. segredos e dados pessoais
const PADROES = [
  ['chave Google/Firebase', /AIza[0-9A-Za-z_-]{35}/g],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g],
  ['token PIT', /\bpit-[0-9a-f]{8}-[0-9a-f-]{20,}/gi],
  ['token Bearer literal', /Bearer\s+(?!\$\{|<|\$|TOKEN\b)[A-Za-z0-9._-]{24,}/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
  ['telefone', /\+\d[\d ]{9,16}\d/g],
];
const PERMITIDOS = [/^\+351900000000$/, /^noreply@anthropic\.com$/];
for (const p of todos) {
  const nome = p.split(/[\\/]/).pop();
  if (!TEXTO.test(nome)) continue;
  const texto = readFileSync(p, 'utf8');
  for (const [tipo, re] of PADROES) {
    for (const m of texto.matchAll(re)) {
      const valor = m[0].trim();
      if (PERMITIDOS.some((r) => r.test(valor))) continue;
      erros.push(`${rel(p)}: possivel ${tipo}: "${valor.slice(0, 24)}${valor.length > 24 ? '…' : ''}"`);
    }
  }
}

// ------------------------------------------------------------------ resultado
for (const a of avisos) console.log(`AVISO  ${a}`);
for (const e of erros) console.log(`ERRO   ${e}`);
console.log(`\n${skills.length} skills, ${markdown.length} ficheiros .md verificados: ${erros.length} erro(s), ${avisos.length} aviso(s).`);
process.exitCode = erros.length ? 1 : 0;
