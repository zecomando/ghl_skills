# MCP oficial do GHL e ferramentas de browser

Duas ligações opcionais que dão ao agente mais alcance:

- **MCP oficial do GHL** — o agente opera dados do CRM (contactos, conversas,
  calendários, oportunidades, pagamentos, …) sem scripts.
- **Browser / computer use** — para o que nenhuma API alcança (consola
  Marketplace, Meta, DNS de email, …). Ver a skill `ghl-computer-use`.

Estado verificado em 2026-10, nas documentações oficiais. Confirma lá antes de
depender de um pormenor.

## Segredos: regra geral

Os exemplos lêem o token de **variáveis de ambiente do sistema** (não do
`.env`, que só os scripts lêem). Nunca escrevas o token directamente num
ficheiro de configuração que vá para o Git.

```bash
export GHL_PIT_LOCATION="..."   # macOS / Linux (ex.: no ~/.zshrc)
export GHL_LOCATION_ID="..."
```

```powershell
# Windows: fica guardado para o utilizador; abrir um terminal novo depois
[Environment]::SetEnvironmentVariable("GHL_PIT_LOCATION", "...", "User")
[Environment]::SetEnvironmentVariable("GHL_LOCATION_ID", "...", "User")
```

## MCP oficial do GHL

Há dois tipos de ligação:

| Endpoint | Autenticação | Para quem |
|---|---|---|
| `https://services.leadconnectorhq.com/mcp/anthropic/v2` | OAuth: entras, escolhes a(s) sub-conta(s), aprovas os scopes | Claude Code / app Claude |
| `https://services.leadconnectorhq.com/mcp/openai/v2/` | OAuth (idem) | Codex / ChatGPT |
| `https://services.leadconnectorhq.com/mcp/` | `Authorization: Bearer <PIT>` + header `locationId` | qualquer cliente MCP (VS Code, Cursor, Gemini CLI, …) |

- Os endpoints OAuth expõem 4 ferramentas genéricas (`list_locations`,
  `search_operations`, `describe_operation`, `execute_operation`) sobre
  centenas de operações. Operações sensíveis pedem confirmação extra. Na
  autorização, escolhe **só** as sub-contas necessárias.
- O endpoint genérico expõe ~36 ferramentas directas e trabalha com a
  sub-conta do PIT.
- Uma sub-conta por pedido. O MCP é a API oficial por outro caminho: as
  armadilhas de `ghl-api-oficial` e as regras de `ghl-seguranca-escrita`
  continuam a valer.

### Claude Code

```bash
# OAuth (recomendado): depois, dentro do Claude Code, /mcp para autenticar
claude mcp add --transport http leadconnector https://services.leadconnectorhq.com/mcp/anthropic/v2
```

Variante com PIT, num `.mcp.json` na raiz do projecto (o `${...}` é lido do
ambiente quando o Claude Code arranca):

```json
{
  "mcpServers": {
    "ghl": {
      "type": "http",
      "url": "https://services.leadconnectorhq.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GHL_PIT_LOCATION}",
        "locationId": "${GHL_LOCATION_ID}"
      }
    }
  }
}
```

### OpenAI Codex

```bash
# OAuth (recomendado)
codex mcp add leadconnector --url https://services.leadconnectorhq.com/mcp/openai/v2/
codex mcp login leadconnector
```

Variante com PIT, em `~/.codex/config.toml` (ou `.codex/config.toml` num
projecto de confiança):

```toml
[mcp_servers.ghl]
url = "https://services.leadconnectorhq.com/mcp/"
bearer_token_env_var = "GHL_PIT_LOCATION"
env_http_headers = { "locationId" = "GHL_LOCATION_ID" }
```

### VS Code (Copilot)

`.vscode/mcp.json` — o VS Code pede os valores uma vez e guarda-os de forma
segura:

```json
{
  "inputs": [
    { "type": "promptString", "id": "ghl-pit", "description": "GHL Private Integration Token", "password": true },
    { "type": "promptString", "id": "ghl-loc", "description": "GHL location id" }
  ],
  "servers": {
    "ghl": {
      "type": "http",
      "url": "https://services.leadconnectorhq.com/mcp/",
      "headers": { "Authorization": "Bearer ${input:ghl-pit}", "locationId": "${input:ghl-loc}" }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` (ou `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "ghl": {
      "url": "https://services.leadconnectorhq.com/mcp/",
      "headers": { "Authorization": "Bearer ${env:GHL_PIT_LOCATION}", "locationId": "${env:GHL_LOCATION_ID}" }
    }
  }
}
```

### Gemini CLI

`.gemini/settings.json` (ou `~/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "ghl": {
      "httpUrl": "https://services.leadconnectorhq.com/mcp/",
      "headers": { "Authorization": "Bearer ${GHL_PIT_LOCATION}", "locationId": "${GHL_LOCATION_ID}" }
    }
  }
}
```

### Outras ferramentas

Qualquer cliente MCP com transporte HTTP serve: URL
`https://services.leadconnectorhq.com/mcp/` e os dois headers acima.

## Browser e computer use

Escolhe **uma** ferramenta; a sessão do GHL é sempre iniciada por ti (o agente
não escreve passwords nem códigos 2FA).

### Playwright MCP (qualquer harness com MCP)

| Ferramenta | Comando |
|---|---|
| Claude Code | `claude mcp add playwright npx @playwright/mcp@latest` |
| Codex | `codex mcp add playwright npx "@playwright/mcp@latest"` |
| VS Code | `code --add-mcp '{"name":"playwright","command":"npx","args":["@playwright/mcp@latest"]}'` |
| Cursor / Gemini CLI | no ficheiro de MCP: `{"mcpServers":{"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}}` |

O perfil do browser persiste por workspace: entras no GHL uma vez. Com
`--extension` (e a extensão "Playwright" no Chrome/Edge) o agente usa os teus
separadores já autenticados.

### Chrome DevTools MCP

| Ferramenta | Comando |
|---|---|
| Claude Code | `claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest` |
| Codex | `codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest` |
| Gemini CLI | `gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest` |
| Cursor / VS Code | servidor MCP com `{"command":"npx","args":["-y","chrome-devtools-mcp@latest"]}` |

Bom para ver os pedidos de rede que a UI do GHL faz. `--autoConnect` liga a um
Chrome já aberto (Chrome 144+, com a depuração remota activada em
`chrome://inspect/#remote-debugging`). Envia estatísticas de uso por omissão;
`--no-usage-statistics` desliga.

### Nativas de cada ferramenta

- **Claude Code / app Claude:** Claude in Chrome — `claude --chrome`, ou
  `/chrome` → "Enabled by default". Usa o teu Chrome/Edge autenticado; precisa
  da extensão e de um plano Pro, Max, Team ou Enterprise.
- **Codex (app desktop):** browser próprio onde entras, extensão para os teus
  separadores, ou o plugin de computer use (macOS/Windows, em regiões
  suportadas).
- **VS Code (Copilot):** ferramentas de browser integradas — activar
  `workbench.browser.enableChatTools`; entrar no GHL no browser integrado e usar
  "Share with Agent".
- **Browser Use** (open source, Python): biblioteca/CLI para agentes próprios,
  com o LLM que quiseres; também tem modo MCP.

### Cuidados

- A pasta de perfil de um browser automatizado guarda a tua sessão do GHL:
  trata-a como uma password (fora do Git, não partilhar).
- Antes de qualquer acção irreversível na UI, o agente deve descrever o que
  vai fazer e esperar pela tua confirmação (regras completas em
  `ghl-computer-use`).
