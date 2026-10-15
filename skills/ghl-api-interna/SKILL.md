---
name: ghl-api-interna
description: Ler, exportar, criar ou modificar workflows, triggers e bots do GoHighLevel (GHL, HighLevel, LeadConnector) pela API interna do editor — a que a própria interface usa — porque a API oficial não devolve a definição de um workflow. Usar sempre que a tarefa envolva passos, acções, triggers, ramificações, publicação ou estatísticas de execução de um workflow, ou bots (Conversation AI, Agent Studio, Voice AI). Cobre endpoints, headers, schema e as armadilhas medidas em produção.
license: MIT
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# API interna do GoHighLevel (editor de workflows e bots)

## O ponto de partida

A API oficial **não serve** para isto. `GET /workflows/` em
`services.leadconnectorhq.com` devolve 7 campos de metadados (`id, name,
status, version, locationId, createdAt, updatedAt`) e mais nada — sem passos,
sem triggers, sem criar/editar/apagar. Não percas tempo a procurar lá.

O editor usa uma **API interna**, não documentada. O mapa abaixo foi extraído
do código do frontend do GHL e validado em produção (centenas de workflows
exportados, 2026-08).

## Autenticação (resumo)

```http
token-id: <id_token Firebase>      # ver a skill ghl-auth-interna
channel: APP                       # obrigatório — sem ele é rejeitado
source: WEB_USER
version: 2021-04-15                # workflows (bots: 2021-07-28)
```

O token obtém-se e renova-se sozinho — ver `ghl-auth-interna`. **Não copiar
nada do DevTools**, salvo o refresh token na primeira vez.

O `locationId` está no URL da app: `/location/<ID>/...`.

## Os serviços

| Serviço | Base | Para quê | Detalhe |
|---|---|---|---|
| Workflows | `https://backend.leadconnectorhq.com/workflow/{loc}` | definição, triggers, criar, editar, publicar | [references/workflows.md](references/workflows.md) |
| Estatísticas | `https://backend.leadconnectorhq.com/workflows` (plural, sem `{loc}`) | inscrições, contactos por passo, logs | [references/workflows.md](references/workflows.md) |
| Bots clássicos (Conversation AI) | `https://services.leadconnectorhq.com/ai-employees` | `/employees`, `/actions`, teste | [references/bots.md](references/bots.md) |
| Agent Studio | `https://services.leadconnectorhq.com/agent-studio` | `/agents`, versões, publicar | [references/bots.md](references/bots.md) |
| Voice AI | `https://services.leadconnectorhq.com/voice-ai` | `/agents`, `/actions` | [references/bots.md](references/bots.md) |
| Rotas de canal dos bots | `https://services.leadconnectorhq.com/agent-deployment/routing-config/configs` | que bot atende que canal | [references/bots.md](references/bots.md) |

Outras superfícies internas conhecidas: custom values da location
(`locations/{id}/customValues`) e criação de templates WhatsApp
(`phone-system/whatsapp/location` — cria, **não** edita nem apaga).

## As armadilhas que custam mais caro (ler antes de escrever)

1. ⛔ **`PUT /{loc}/{id}` substitui o objecto INTEIRO.** O que não for no corpo
   é apagado (volta ao default) — e a releitura do campo que mudaste confirma
   que "ficou bem". Preservar as 11 definições da raiz:
   `allowMultiple · allowMultipleOpportunity · removeContactFromLastStep ·
   stopOnResponse · autoMarkAsRead · timezone · eventStartDate · window ·
   senderAddress · workflowNote · meta`. No kit: `corpoPreservado(w, mudancas)`.
2. ⛔ **Editar um workflow publicado NÃO o publica.** O motor executa o ficheiro
   em `fileUrl`, que fica uma versão atrás. Republicar com
   `PUT /{loc}/change-status/{id}` + `{status:"published", updatedBy:<userId>}`
   e confirmar lendo o `fileUrl`. No kit: `ghl-workflow-republicar.mjs`.
3. **Os triggers não vêm no GET do workflow** (vem `triggers: []`). Têm endpoint
   próprio. E **criar** um trigger por API deixa-o órfão (não liga ao
   workflow) — editar funciona; para um trigger novo, duplicar um workflow que
   já o tenha, ou usar a UI.
4. **`allowMultiple:false` (o default) cala um workflow a partir da 2.ª vez** —
   e a inscrição responde 200 na mesma. Prova de execução: `count-per-step`.
5. **Publicar exige `order` por ramo e `workflowsActionType` só em alguns
   tipos de passo** — errar num deles dá "corrupted type/order" ou parte o
   editor. Regras exactas em [references/workflows.md](references/workflows.md).
6. **A listagem mistura pastas com workflows** — filtrar `type === 'workflow'`.
7. **As definições contêm segredos vivos** (tokens em passos de webhook). Nunca
   versionar exports.
8. **Um 404 num endpoint interno pode ser o método errado**, não a ausência da
   funcionalidade. Antes de concluir "isto não dá por API", tentar
   GET/POST/PUT/PATCH — um 422 é sinal de que há alguém a ouvir.
9. **A resposta vem na raiz, não embrulhada.** Usar `data?.workflow ?? data` e
   `data?.employee ?? data?.data ?? data` — **nunca `?? {}`**, que devolve
   tudo vazio e faz parecer que o objecto não tem nada.

Lista completa (22 armadilhas de workflows, 8 de bots, rotas de canal, teste de
bots, schema e topologia dos passos) nas referências:

- [references/workflows.md](references/workflows.md) — endpoints, estatísticas, armadilhas, schema
- [references/bots.md](references/bots.md) — Conversation AI, Agent Studio, Voice AI, rotas, teste

## Antes de qualquer escrita

Ler `ghl-seguranca-escrita`. Em resumo: backup antes, 1 objecto antes de
centenas, conferir o `locationId` que o servidor devolve antes do PUT,
simulação por omissão, e releitura sabendo onde ela mente.

## Ética e limites

São endpoints internos, não suportados e sem aviso de mudança. Exportar os
dados **da própria conta** é portabilidade normal. Automação permanente e
massiva contra `backend.leadconnectorhq.com` cai numa zona cinzenta dos termos
de serviço do GHL. Não contornar detecção, não usar em contas de terceiros sem
autorização, manter ritmo conservador. Os ficheiros de workflow no Firebase
Storage respondem sem autenticação a quem souber o caminho — saber isso serve
para proteger, não para explorar.
