# GHL Skills — o GoHighLevel para agentes de IA

Uma colecção de **skills** para trabalhar o **GoHighLevel** (GHL, HighLevel,
LeadConnector) com agentes de IA — no **Claude Code**, **Codex**, **VS Code
(Copilot)**, **Cursor**, **Gemini CLI**, **Windsurf/Devin**, **OpenCode**, ou
qualquer outra ferramenta e modelo.

Cobre todos os caminhos de automação do GHL: a **API oficial**, o **servidor
MCP oficial**, a **API interna** do editor (workflows e bots), **scripts**, a
orquestração com o **Make**, e **browser / computer use** para o que nenhuma
API alcança. Cada facto vem de uso real em produção, com data — incluindo as
armadilhas em que a plataforma responde "200 OK" e não fez o que devia.

Escrito em português de Portugal.

## Instalação rápida

Em qualquer ferramenta (precisa de Node.js):

```bash
npx skills add zecomando/ghl_skills
```

No Claude Code, como plugin:

```text
/plugin marketplace add zecomando/ghl_skills
/plugin install ghl-skills@ghl-skills
```

Instruções para cada ferramenta (Codex, VS Code, Cursor, Gemini, Antigravity,
Windsurf/Devin, Kiro, cópia manual, modelos sem suporte a skills):
**[docs/instalacao.md](docs/instalacao.md)**.

## As skills

| Skill | O que cobre | Abrir quando |
|---|---|---|
| [ghl-mapa](skills/ghl-mapa/SKILL.md) | os caminhos de automação + matriz do que cada um faz e não faz | **sempre primeiro** |
| [ghl-seguranca-escrita](skills/ghl-seguranca-escrita/SKILL.md) | simulação, allowlist de locations, falsos verdes, segredos, idempotência | **antes de qualquer escrita** |
| [ghl-api-oficial](skills/ghl-api-oficial/SKILL.md) | `services.leadconnectorhq.com` e o MCP oficial: PIT/OAuth, `Version`, rate limit, armadilhas por domínio | qualquer chamada à API ou ao MCP |
| [ghl-api-interna](skills/ghl-api-interna/SKILL.md) | API do editor: workflows, triggers, publicação, estatísticas, bots, rotas de canal | workflows e bots |
| [ghl-auth-interna](skills/ghl-auth-interna/SKILL.md) | token de sessão renovável para a API interna | API interna; 401 |
| [ghl-scripts](skills/ghl-scripts/SKILL.md) | kit Node sem dependências + convenções para scripts novos | operar em massa, auditar, exportar |
| [ghl-canais](skills/ghl-canais/SKILL.md) | SMS, WhatsApp, email, voz — o que cada canal permite e onde mente | enviar mensagens ou chamadas |
| [ghl-make](skills/ghl-make/SKILL.md) | Make como orquestrador: API v2, blueprints, padrão de campanha | cenários Make (ou n8n, Zapier) |
| [ghl-app-marketplace](skills/ghl-app-marketplace/SKILL.md) | serviço próprio que o GHL chama: acções custom, webhooks Ed25519, OAuth | integrações próprias |
| [ghl-computer-use](skills/ghl-computer-use/SKILL.md) | o que só a UI faz + regras e ferramentas de browser | quando nenhuma API alcança |

O agente carrega só o que a tarefa precisa: primeiro o `ghl-mapa`, depois a
skill do caminho escolhido.

## Kit de scripts

Seis comandos prontos (verificar credenciais, procurar contactos, validar
pipelines, tags com verificação, exportar workflows, republicar workflows
cujo motor ficou desactualizado) e uma biblioteca para escrever outros.
Simulam por omissão: só escrevem com `--executar` e numa location autorizada.

1. Copiar [`.env.example`](.env.example) para `.env` na pasta do teu projecto
   e preencher.
2. Correr o diagnóstico (não escreve nada):

```bash
node skills/ghl-scripts/scripts/ghl-verificar.mjs
```

Detalhe: [skills/ghl-scripts/SKILL.md](skills/ghl-scripts/SKILL.md).

## MCP oficial e browser

O GHL tem um servidor MCP oficial (OAuth para Claude e Codex; PIT para os
restantes), e qualquer harness pode usar Playwright MCP, Chrome DevTools MCP
ou as ferramentas de browser nativas. Configuração para cada ferramenta:
**[docs/mcp-e-browser.md](docs/mcp-e-browser.md)**.

## Segurança primeiro

- Escrever no CRM é muito mais arriscado do que ler: o perigo é a API
  responder 200 **na conta errada**. Toda a escrita declara a location, que
  tem de estar numa lista autorizada.
- Os tokens ficam no `.env` (fora do Git). Os exports de workflows trazem
  tokens vivos — também ficam fora do Git.
- O agente nunca pede passwords nem tokens de acesso, e confirma contigo antes
  de qualquer acção irreversível.

## Estrutura

```text
AGENTS.md              instruções para qualquer agente (CLAUDE.md e GEMINI.md importam-no)
skills/<nome>/         uma pasta por skill: SKILL.md + references/ (+ scripts/ no ghl-scripts)
docs/                  instalação, MCP e browser, contribuir
testes/                testes do kit de scripts (sem rede)
ferramentas/validar.mjs   valida formato, links e procura segredos
.claude-plugin/        plugin para Claude Code e Codex
.env.example           modelo das credenciais
```

## Contribuir

Correcções com medição datada são bem-vindas. Antes de cada commit:

```bash
node ferramentas/validar.mjs
node --test
```

Regras em [docs/contribuir.md](docs/contribuir.md) — sobretudo: **nada de
dados de clientes**.

## Avisos

- Projecto independente, sem ligação à HighLevel Inc. "GoHighLevel",
  "HighLevel" e "LeadConnector" são marcas dos respectivos donos.
- A **API interna** não é documentada nem suportada: pode mudar sem aviso, e
  automação massiva contra ela cai numa zona cinzenta dos termos de serviço.
  Usar só na própria conta, com ritmo conservador.
- Os factos foram medidos em 2026; a plataforma muda. Na dúvida, medir.
- Usar por tua conta e risco (ver a licença).

## Licença

[MIT](LICENSE) © 2026 zecomando
