# Contribuir e manter

## A regra de manutenção

Uma skill que contradiz a produção é pior do que não ter skill. Quando uma
medição nova contradiz o que aqui está: **corrigir o documento com a medição
datada** — não desviar em silêncio. Várias afirmações desta base de
conhecimento sobreviveram meses sem tráfego que as confirmasse. Na dúvida,
medir.

Ao acrescentar um facto:

- Diz **como** foi medido e **quando** (`medido a 2026-08-13`).
- Distingue "medido", "documentação oficial diz" e "por verificar" (❓).
- Escreve o porquê e o incidente, não só a regra.

## Nada de dados de clientes

Este repositório é público. Nunca:

- ids de contas, locations, workflows, WABAs; nomes de pessoas ou empresas;
  telefones, emails; tokens, chaves, exports.
- Exemplos de telefone: `+351900000000` ou dígitos `X`.

O validador procura padrões de segredos e dados pessoais, mas não sabe que
nomes são de clientes — isso é responsabilidade de quem escreve.

## Formato das skills

- Pasta `skills/<nome>/` com `SKILL.md`; `name` no frontmatter **igual** ao
  nome da pasta (minúsculas, números e hífens).
- Frontmatter só com os campos da especificação Agent Skills: `name`,
  `description` (até 1024 caracteres: o que faz **e** quando usar),
  `license`, `compatibility`, `metadata`, `allowed-tools`. Valores com `: `
  vão entre aspas.
- `SKILL.md` com menos de 500 linhas; o detalhe vai para `references/`
  (um nível, ligado a partir do `SKILL.md`).
- Português de Portugal. Código: comentários sem acentos (evita problemas de
  codificação em terminais Windows).
- Para referir outra skill, o nome entre crases: `ghl-mapa`.

## Verificar antes de cada commit

```bash
node ferramentas/validar.mjs
node --test
```

O validador confere o formato das skills, os links e procura segredos/dados
pessoais. Os testes cobrem o kit de scripts com respostas simuladas — não
tocam em nenhuma conta GHL.

## Versões do plugin

O `.claude-plugin/plugin.json` não fixa `version`: cada commit no ramo
principal é uma versão nova para quem instalou o plugin. Quem instalou por
`npx skills` ou por cópia actualiza correndo o comando outra vez.
