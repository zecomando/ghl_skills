---
name: ghl-api-oficial
description: A API oficial do GoHighLevel (GHL, HighLevel, LeadConnector — services.leadconnectorhq.com) e o servidor MCP oficial que a expõe — autenticação PIT vs OAuth, header Version, rate limits, cobertura por domínio (contactos, calendários, oportunidades, conversas, tags, campos, workflows) e as armadilhas medidas em produção. Usar em qualquer chamada à API oficial ou ao MCP oficial, e antes de assumir que um endpoint existe ou que um 200 prova alguma coisa.
license: MIT
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# API oficial do GoHighLevel

Base: `https://services.leadconnectorhq.com`. Esta API cobre o **data plane** —
os dados que o CRM guarda. Não cobre as **definições de editor** (passos de
workflows, bots, publicação), que vivem na API interna — ver `ghl-api-interna`.

Documentação oficial: <https://marketplace.gohighlevel.com/docs/>.

## Autenticação: dois tipos de credencial

| Tipo | O que é | Quando usar |
|---|---|---|
| **PIT** (Private Integration Token) | token estático, criado em Settings → Private Integrations, ao nível da agência ou da sub-conta; sem expiração documentada (a doc recomenda rodar a cada 90 dias) | desenvolvimento, scripts, a própria conta |
| **OAuth** (app Marketplace) | token por location instalada; access token ~24 h; **refresh token single-use** (usar invalida-o e devolve um novo; vale até 1 ano se não for usado) | produção multi-conta, webhooks, acções custom, provider de conversas |

- ⚠️ **PIT de agência ≠ PIT de sub-conta.** Um token de agência lista
  sub-contas mas responde `Token's user type mismatch!` em endpoints de
  sub-conta. E um token que alcança muitas sub-contas é a razão de toda a
  escrita passar por uma guarda de location (ver `ghl-seguranca-escrita`).
- Alguns endpoints são marcados "OAuth access token only" e rejeitam PITs.
- Rodar um PIT: "rotate and expire later" mantém o antigo válido 7 dias;
  "expire now" é para fugas.
- O refresh OAuth é single-use: dois refreshes concorrentes para a mesma
  location matam um token para sempre. Serializar por location.
- Scopes: **só os que têm chamada**. Lista usada numa app de produção (voz +
  CRM): `contacts.readonly/write`, `calendars.readonly`,
  `calendars/events.readonly/write`, `opportunities.readonly/write`,
  `locations/tags.readonly/write`, `locations/customFields.readonly`,
  `conversations.readonly`, `conversations/message.readonly/write`,
  `workflows.readonly`, `users.readonly`, `locations.readonly`,
  `oauth.readonly/write` (só para instalação de agência).
- ⚠️ A grafia `locations/customFields.*` vs `locations/custom-fields.*` aparece
  das duas formas na documentação — testar a troca de token primeiro.

## O header `Version` — enviar sempre um

A documentação oficial (2026) lista `v3` (lançado a 2026-06-11),
`2023-02-21`, `2021-07-28` e `2021-04-15`, e recomenda `v3` por omissão. Em
produção, a matriz que funcionou foi esta — e enviar o "errado" **não dá
erro**: pode dar 200 com um corpo de forma diferente:

| `Version` | Endpoints (medido) |
|---|---|
| `2021-07-28` | oportunidades, tags e campos da location, inscrição em workflow, locations, users |
| `v3` | contactos (CRUD), `/calendars/events/appointments`, conversas |
| `2021-04-15` | `/calendars/{id}/free-slots`, `/calendars/events` (listagem) |

Omitido tem comportamento não documentado. Ao mudar de versão num endpoint,
comparar a forma da resposta antes de confiar nela.

## Rate limit

- **100 pedidos/10 s em burst + 200 000/dia, por app Marketplace e por
  recurso (location ou empresa)** — partilhado com tudo o mais que toca na
  mesma location (cenários Make, outras integrações). Correr deliberadamente
  abaixo (o kit usa 80/10 s), não no tecto.
- Headers de uso: `X-RateLimit-Max`, `X-RateLimit-Remaining`,
  `X-RateLimit-Interval-Milliseconds`, `X-RateLimit-Limit-Daily`,
  `X-RateLimit-Daily-Remaining`.
- 503 esporádicos existem. Repetir com backoff em **429 e 5xx**, nunca noutro
  4xx.
- ⚠️ **POST não é repetível por omissão.** Um 503 depois de a linha criada é
  indistinguível de um que nunca chegou — repetir
  `POST /calendars/events/appointments` já transformou uma reunião em quatro.
  Só se repete GET/PUT/DELETE, ou POST explicitamente idempotente
  (`/contacts/upsert`).

## Cobertura por domínio — o que foi medido

Contactos, calendários, oportunidades e conversas têm armadilhas suficientes
para uma referência própria: [references/endpoints.md](references/endpoints.md).
O essencial:

- **Contactos:** escrever por `POST /contacts/upsert` (o `POST /contacts/` dá
  400 quando a location bloqueia duplicados). `GET /contacts/{id}` não filtra
  por location — conferir o `locationId` da resposta. Lookup por telefone:
  `GET /contacts/search/duplicate` com o `+` codificado. Tags por **nome**.
  DND por canal em `dndSettings`.
- **Telefones:** nunca concatenar prefixo; validar E.164 e recusar o resto.
- **Calendários:** tempos em **epoch ms**; `timezone` IANA explícito; janela
  máx. 31 dias no `free-slots`; marcar com `startTime` ISO **com offset**;
  cancelar é `PUT {appointmentStatus:"cancelled"}`; `DELETE` apaga o histórico
  e a releitura mente.
- **Oportunidades:** `/opportunities/search` usa **snake_case**; validar todo o
  stage contra os pipelines (stages órfãos existem).
- **Conversas:** media WhatsApp só pelo caminho `whatsapp.media` (ver
  `ghl-canais`); `type:"Call"` exige provider registado.
- **Workflows:** `GET /workflows` só dá 7 campos de metadados. A definição
  está na API interna.

## O servidor MCP oficial

O GHL expõe a API oficial como servidor MCP — uma forma de qualquer harness
compatível (Claude Code, Codex, VS Code, Cursor, Gemini CLI…) usar o GHL sem
scripts:

| Endpoint | Autenticação | Ferramentas |
|---|---|---|
| `https://services.leadconnectorhq.com/mcp/anthropic/v2` (Claude) e `.../mcp/openai/v2/` (ChatGPT/Codex) | OAuth (escolher sub-conta(s) e aprovar scopes) | 4 ferramentas de fachada (`list_locations`, `search_operations`, `describe_operation`, `execute_operation`) sobre centenas de operações em dezenas de domínios |
| `https://services.leadconnectorhq.com/mcp/` (genérico) | `Authorization: Bearer <PIT>` + header `locationId` | ~36 ferramentas (contactos, conversas, calendários, oportunidades, pagamentos, …) |

Configuração por ferramenta: [docs/mcp-e-browser.md](https://github.com/zecomando/ghl_skills/blob/main/docs/mcp-e-browser.md).

O MCP é a mesma API por baixo: **as armadilhas desta skill continuam a
valer** (falsos verdes, DND, telefones, stages órfãos), e as regras de
`ghl-seguranca-escrita` também. Uma sub-conta por pedido; dar à autorização
OAuth só as sub-contas necessárias — a autorização é a fronteira.

## Diagnóstico: a regra que poupa tardes

```
401/403 = o token está mal (expirado, scope errado, tipo errado).
TUDO O RESTO, 422 incluído = a autenticação passou; o pedido está mal formado.
```

O GHL responde **422 a query params que não conhece** em vez de os ignorar
(`{"message":["property skip should not exist"]}`), e endpoints do mesmo
serviço discordam sobre quais aceitam. Tratar 422 como falha de autenticação
manda rodar um token perfeitamente bom.

## O que a API oficial NÃO faz

- definição de workflow (passos, triggers, publicar, copiar) → API interna
- bots / Conversation AI / Agent Studio (configuração) → API interna
- estatísticas de execução de workflow → API interna (`enroll-stats`)
- estado do bot por conversa → **não existe em lado nenhum** (só na UI)
- templates WhatsApp → a interna cria, não edita nem apaga; aprovação é na Meta
- app Marketplace, consentimento, snapshots, billing, números → `ghl-computer-use`

## Um cliente bem feito (em qualquer linguagem)

O kit da skill `ghl-scripts` (`scripts/lib/oficial.mjs`) junta numa
implementação só: matriz de `Version`, ritmo por location, repetição segura
(POST não se repete), guarda de escrita e a classificação de erros acima.
`locationId` é obrigatório em toda a escrita — sem ele, é recusada antes de
sair um byte. Quem escrever noutra linguagem deve copiar estas cinco regras,
não a sintaxe. E cada função que escreve devolve um resultado honesto: `ok`
só quando o GHL devolveu o id — nunca algo que o chamador confunda com
sucesso.
