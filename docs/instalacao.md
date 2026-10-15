# Instalação por ferramenta

As skills seguem a especificação aberta **Agent Skills**
([agentskills.io](https://agentskills.io)): cada uma é uma pasta com um
`SKILL.md`. A maioria das ferramentas de IA para código lê este formato
sozinha. Para as que não lêem, o `AGENTS.md` deste repositório faz de manual
de entrada.

Estado verificado em 2026-10. As ferramentas mudam depressa: se um caminho
deixar de funcionar, a documentação da ferramenta manda.

## Escolhe o teu caso

| Quero… | Faz isto |
|---|---|
| usar as skills **nos meus projectos**, em qualquer ferramenta | [instalador universal](#instalador-universal-npx-skills) |
| usar no **Claude Code** (ou Codex) com actualizações fáceis | [plugin](#claude-code) |
| trabalhar **dentro deste repositório** (correr os scripts, contribuir) | `git clone` e abrir a pasta na ferramenta: o `AGENTS.md` orienta o agente |
| usar com uma ferramenta ou um modelo **sem suporte a skills** | [qualquer outro harness](#qualquer-outro-harness-ou-llm) |

Depois de instalar: configurar as credenciais (`.env`, ver
[`.env.example`](../.env.example)) e, se quiseres, o MCP oficial e o browser
([mcp-e-browser.md](mcp-e-browser.md)).

## Instalador universal (`npx skills`)

Precisa de Node.js. Instala em 79 ferramentas (Claude Code, Codex, Copilot,
Cursor, Gemini CLI, Antigravity, Windsurf/Devin, OpenCode, Cline, Amp, Goose,
Kiro, Junie, …) e pergunta em quais:

```bash
npx skills add zecomando/ghl_skills
```

Opções úteis:

| Opção | Efeito |
|---|---|
| `-g` | instala para o utilizador (todas as pastas/projectos), em vez de só no projecto actual |
| `-a codex cursor` | escolhe as ferramentas (ids: `claude-code`, `codex`, `github-copilot`, `cursor`, `gemini-cli`, `antigravity`, `windsurf`, `devin`, `opencode`, `cline`, `amp`, `goose`, `kiro-cli`, `junie`, …) |
| `-s ghl-mapa ghl-api-oficial` | só algumas skills |
| `-l` | lista as skills do repositório sem instalar |
| `--copy` | copia os ficheiros em vez de criar ligações (útil no Windows se as ligações simbólicas falharem) |
| `-y` | sem perguntas |

Para actualizar, corre o mesmo comando outra vez. O instalador comunica as
instalações a um contador público (skills.sh); para desligar, define
`DISABLE_TELEMETRY=1`.

## Claude Code

**Plugin (recomendado — actualiza-se pelo próprio Claude Code):**

```text
/plugin marketplace add zecomando/ghl_skills
/plugin install ghl-skills@ghl-skills
```

Ou no terminal: `claude plugin marketplace add zecomando/ghl_skills` e
`claude plugin install ghl-skills@ghl-skills --scope user`. As skills ficam
com o prefixo do plugin: `/ghl-skills:ghl-mapa`. Para actualizar:
`claude plugin marketplace update ghl-skills` (ou activar a actualização
automática em `/plugin`).

**Cópia simples:** copiar as pastas de `skills/` para `.claude/skills/` (só
este projecto) ou `~/.claude/skills/` (todos). Invocam-se como `/ghl-mapa`.
O Claude Code **não** lê `.agents/skills/`.

O `CLAUDE.md` deste repositório importa o `AGENTS.md` (`@AGENTS.md`).

## OpenAI Codex (CLI, extensão IDE, app desktop)

- `npx skills add zecomando/ghl_skills -a codex`, ou copiar as pastas para
  `.agents/skills/` (projecto) ou `~/.agents/skills/` (utilizador).
- Como plugin: `codex plugin marketplace add zecomando/ghl_skills` (o Codex lê
  o mesmo `.claude-plugin/marketplace.json`).
- Ou pedir ao próprio Codex, uma skill de cada vez:
  `$skill-installer install https://github.com/zecomando/ghl_skills/tree/main/skills/ghl-mapa`
  (instala em `~/.codex/skills`; reiniciar o Codex se não aparecer).
- Invocar: automático, ou `$ghl-mapa`; listar com `/skills`. O Codex lê o
  `AGENTS.md` nativamente.

## VS Code (GitHub Copilot, modo agente)

- Pastas lidas: `.github/skills/`, `.claude/skills/` ou `.agents/skills/`
  (projecto); `~/.copilot/skills/` ou `~/.agents/skills/` (utilizador).
- `npx skills add zecomando/ghl_skills -a github-copilot`.
- Invocar: automático ou `/ghl-mapa`; listar com `/skills`. O VS Code
  descarta em silêncio skills cujo `name` não bate com a pasta — não mudar
  nomes de pastas à mão.
- O `AGENTS.md` é lido nativamente (não é preciso
  `.github/copilot-instructions.md`).
- **Copilot CLI:** `copilot skill add <pasta ou URL>`; mesmas pastas.
- Se usares as extensões do **Claude Code** ou do **Codex** dentro do VS Code,
  valem as instruções dessas ferramentas.

## Cursor

Pastas lidas: `.agents/skills/`, `.cursor/skills/`, `.claude/skills/` (e as
mesmas em `~/`). `npx skills add zecomando/ghl_skills -a cursor`. Invocar com
`/ghl-mapa`; ver em Customize › Skills. Lê o `AGENTS.md`.

## Gemini CLI e Antigravity

- **Gemini CLI:** `.gemini/skills/` ou `.agents/skills/` (projecto), as
  mesmas em `~/`. `npx skills add zecomando/ghl_skills -a gemini-cli`, ou
  `gemini skills install https://github.com/zecomando/ghl_skills.git --path skills/ghl-mapa`
  (uma skill de cada vez). Pede consentimento na primeira utilização; listar
  com `/skills list`. O Gemini lê o `GEMINI.md`, que importa o `AGENTS.md`.
- **Antigravity** (app, IDE, CLI `agy`): `.agents/skills/` (projecto);
  `~/.gemini/config/skills/` (utilizador). Lê o `AGENTS.md`.

## Windsurf / Devin (Desktop e CLI)

Pastas lidas: `.agents/skills/`, `.devin/skills/`, `.windsurf/skills/` (e
importa `.claude/` e `.github/`); utilizador: `~/.agents/skills/`.
`npx skills add zecomando/ghl_skills -a devin`. Invocar pelo nome da pasta
(`/ghl-mapa`); listar com `devin skills list`. Lê o `AGENTS.md`.

## Outras ferramentas com suporte a skills

| Ferramenta | Pasta do projecto | Pasta do utilizador |
|---|---|---|
| OpenCode | `.agents/skills/` (ou `.claude/skills/`) | `~/.agents/skills/` |
| Cline | `.agents/skills/` (ou `.cline/skills/`) | `~/.agents/skills/` |
| Amp | `.agents/skills/` | `~/.agents/skills/` |
| Goose | `.agents/skills/` | `~/.agents/skills/` |
| Junie (JetBrains) | `.junie/skills/` (a CLI também lê `.agents/skills/`) | `~/.junie/skills/` |
| JetBrains AI Assistant (agentes Claude/Codex) | `.agents/skills/` ou `.claude/skills/` | — |
| **Kiro** | **`.kiro/skills/`** (só esta) | `~/.kiro/skills/` |

`.agents/skills/` chega a todas excepto Claude Code e Kiro.

## Cópia manual

Funciona para qualquer pasta da lista acima. Exemplo para `~/.agents/skills/`:

```bash
git clone https://github.com/zecomando/ghl_skills.git
mkdir -p ~/.agents/skills
cp -r ghl_skills/skills/* ~/.agents/skills/
```

No Windows (PowerShell):

```powershell
git clone https://github.com/zecomando/ghl_skills.git
New-Item -ItemType Directory -Force "$HOME\.agents\skills" | Out-Null
Copy-Item -Recurse -Force ghl_skills\skills\* "$HOME\.agents\skills\"
```

Para actualizar: `git pull` na pasta clonada e copiar outra vez.

## Qualquer outro harness ou LLM

As skills são Markdown simples — servem a qualquer modelo (incluindo modelos
locais) e a qualquer ferramenta que leia ficheiros:

1. Dá ao agente o `AGENTS.md` (ou cola-o no início da conversa / nas
   instruções do projecto).
2. Ele lê `skills/ghl-mapa/SKILL.md` e, a partir daí, só a skill que a tarefa
   pede.
3. Sem acesso a ficheiros (chat web): cola o `ghl-mapa` e a skill relevante na
   conversa. Os scripts precisam de alguém (ou de uma ferramenta) que corra
   `node`.

A app Claude (web/desktop) também aceita skills carregadas como ficheiro zip
(uma pasta de skill por zip) — ver a ajuda da Anthropic.

## Depois de instalar: confirmar que funciona

1. Pergunta ao agente: *"Que caminho uso para ler os passos de um workflow do
   GHL?"* — deve responder **API interna** (citando o `ghl-mapa`), não a API
   oficial.
2. Na pasta do teu projecto, com o `.env` preenchido:
   `node <pasta da skill ghl-scripts>/scripts/ghl-verificar.mjs`.
