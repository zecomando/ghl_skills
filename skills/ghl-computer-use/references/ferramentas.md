# Ferramentas de browser e computer use — qual usar com o GHL

Estado em 2026-10. As ferramentas mudam depressa: confirmar na documentação de
cada uma antes de depender de um pormenor.

| Ferramenta | Onde existe | Sessão do GHL | Bom para |
|---|---|---|---|
| **Playwright MCP** (`@playwright/mcp`) | qualquer harness com MCP (Claude Code, Codex, VS Code, Cursor, Gemini CLI, …) | perfil persistente por workspace: a pessoa entra uma vez; ou `--extension` para usar os separadores já autenticados do Chrome/Edge | navegação por papel/texto (árvore de acessibilidade), formulários, prova por snapshot |
| **Chrome DevTools MCP** (`chrome-devtools-mcp`) | idem | perfil próprio persistente; ou `--autoConnect` a um Chrome já aberto | o mesmo + rede e consola: ver os pedidos que a UI faz (útil para descobrir endpoints internos) |
| **Claude in Chrome** | Claude Code (`claude --chrome`) e app Claude | o Chrome/Edge da pessoa, já autenticado | tarefas na conta real da pessoa; pára em páginas de login e CAPTCHA |
| **Browser do Codex / extensão / computer use** | app ChatGPT/Codex (desktop) | browser próprio onde a pessoa entra, ou os separadores dela pela extensão | o mesmo, no ecossistema OpenAI |
| **Ferramentas de browser do VS Code (Copilot)** | VS Code, modo agente | browser integrado; a pessoa entra e usa "Share with Agent" | trabalho dentro do editor |
| **Browser Use** (biblioteca/CLI, open source) | qualquer sítio com Python | perfil do Chrome do sistema ou CDP | agentes próprios em código, com o LLM que quiseres |
| **Computer use de ecrã inteiro** | apps desktop (ex.: Claude, Codex) | o que estiver no ecrã | último recurso, quando nada acima chega |

## Como usar com o GHL

- **Preferir ferramentas que lêem a página como texto/árvore** (snapshot de
  acessibilidade) a screenshots: são mais baratas e mais fiáveis para
  confirmar texto, estados e ids.
- **Primeiro passo de qualquer sessão:** ler o URL actual e confirmar
  `/location/{id}/` contra a location pretendida. Se for a vista de agência,
  entrar na sub-conta certa antes de mais nada.
- **Descobrir um endpoint interno:** com o Chrome DevTools MCP (ou o separador
  Network), fazer a operação uma vez na UI e ler o pedido — método, caminho,
  headers não sensíveis e corpo. Depois, documentar e passar a fazê-lo por
  API (ver `ghl-api-interna`). Nunca copiar tokens do pedido para o chat ou
  para ficheiros versionados.
- **Perfis persistentes guardam a sessão do GHL.** Tratar a pasta do perfil
  como uma credencial: não a partilhar, não a pôr em repositórios.
- **Prova no fim:** um snapshot/screenshot do estado final (ex.: template em
  "pending", versão nova da app listada) e um resumo do que mudou.
