---
name: ghl-mapa
description: Mapa de capacidades do GoHighLevel (GHL, HighLevel, LeadConnector) — o que se consegue fazer pela API oficial, pelo servidor MCP oficial, pela API interna do editor, por scripts, pelo Make e só pelo browser (computer use). Ler PRIMEIRO em qualquer tarefa GHL para escolher o caminho certo e não perder tempo num caminho que não existe.
license: MIT
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# Mapa de capacidades do GoHighLevel

O GoHighLevel tem **vários caminhos de automação**, não um. Escolher o errado
é a forma mais comum de perder um dia — e a API oficial é onde a maioria das
pessoas vai procurar o que lá não existe.

## Os caminhos

| Caminho | O que é | Autenticação | Skill |
|---|---|---|---|
| **API oficial** | `services.leadconnectorhq.com` — o data plane: contactos, calendários, oportunidades, conversas, tags, campos, notas | `Authorization: Bearer <PIT ou OAuth>` + header `Version` | `ghl-api-oficial` |
| **MCP oficial** | a API oficial exposta como servidor MCP — qualquer harness compatível a usa sem código | OAuth (endpoints Claude/OpenAI) ou PIT + `locationId` | `ghl-api-oficial` |
| **API interna** | `backend.leadconnectorhq.com/workflow` e `services.leadconnectorhq.com/{ai-employees,agent-studio,…}` — o que o próprio editor usa: definições de workflows, triggers, bots, publicação, estatísticas | `token-id: <id_token Firebase>` + `channel: APP` + `source: WEB_USER` | `ghl-api-interna` + `ghl-auth-interna` |
| **Scripts** | Node sem dependências sobre as duas APIs: exportar, auditar, corrigir em massa — com simulação por omissão e guarda de location | os mesmos, por dentro | `ghl-scripts` |
| **Computer use / browser** | o que nenhuma API alcança: consola Marketplace, consentimento OAuth, Meta/templates, infra de email, definições de conta | sessão humana no browser | `ghl-computer-use` |

Um **orquestrador** (Make, n8n, os próprios workflows do GHL) não é mais um
caminho de acesso: é quem decide *quando* chamar os outros — ver `ghl-make`. Um
**serviço próprio** que o GHL chama (acções custom, webhooks) — ver
`ghl-app-marketplace`.

## Regra de decisão

1. É dados de CRM (contacto, marcação, pipeline, tag, nota, mensagem)? → **API
   oficial** — ou o **MCP oficial**, se estiver ligado no harness e a tarefa for
   pontual. Ver `ghl-api-oficial`.
2. É definição de editor (passos de workflow, triggers, bots, publicar, stats
   de execução)? → **API interna**. Ver `ghl-api-interna` (+ `ghl-auth-interna`).
3. É repetível, em massa, ou de auditoria? → **script**, com guarda de
   location e simulação por omissão. Ver `ghl-scripts`.
4. É orquestração de campanha (elegibilidade, janelas, retries, ordens para
   um serviço)? → **orquestrador**. Ver `ghl-make`.
5. Nada acima alcança? → **browser / computer use**, ou aceitar que não se
   automatiza. Ver `ghl-computer-use`.
6. Antes de **qualquer escrita**: `ghl-seguranca-escrita`. Sem excepções.
7. Antes de enviar mensagens ou chamadas: `ghl-canais`.

## Matriz de capacidades

✅ = funciona e está medido · 🟡 = parcial ou com armadilha conhecida · ❌ = não
existe · ❓ = por verificar (não assumir nem num sentido nem noutro)

O MCP oficial cobre, por definição, o que a API oficial cobre (coluna "API
oficial") — com as mesmas armadilhas.

### Contactos e CRM

| Operação | API oficial | API interna | UI / computer use |
|---|---|---|---|
| Ler contacto por id / telefone | ✅ `GET /contacts/{id}`, `search/duplicate` | | ✅ |
| Criar/actualizar contacto | 🟡 só `POST /contacts/upsert` — `POST /contacts/` dá 400 com duplicados bloqueados | | ✅ |
| Pesquisa livre de contactos | 🟡 `POST /contacts/search` existe mas a gramática do corpo é pouco documentada; usar `search/duplicate` por telefone | | ✅ |
| Tags no contacto | ✅ por **nome** (não id) | | ✅ |
| Notas | ✅ `POST /contacts/{id}/notes` | | ✅ |
| DND por canal | 🟡 só `dndSettings` por canal; o booleano `dnd` reverte-se sozinho | | ✅ |
| Campos personalizados: ler catálogo | ✅ `GET /locations/{id}/customFields` | | ✅ |
| Campos personalizados: escrever no contacto | ✅ via upsert `{customFields:[{id,field_value}]}` | | ✅ |
| Custom values (da location) | ❌ | 🟡 `locations/{id}/customValues` | ✅ Settings → Custom Values |
| Apagar contacto | ✅ `DELETE /contacts/{id}` | | ✅ |

### Calendários e marcações

| Operação | API oficial | API interna | UI |
|---|---|---|---|
| Disponibilidade (free-slots) | ✅ lista; **nunca** responde sim/não | | ✅ |
| Marcar | ✅ POST + reconfirmação do slot; **sem chave de idempotência** — nunca repetir o POST | | ✅ |
| Remarcar / cancelar | ✅ PUT; cancelar = `appointmentStatus:"cancelled"` | | ✅ |
| Apagar | 🟡 DELETE existe mas **apaga o histórico** e a releitura devolve o evento apagado (falso verde) | | ✅ |
| Listar eventos | ✅ epoch **ms**; início respeitado à **granularidade do dia** | | ✅ |
| Criar calendário / grupo | ❓ (existe `POST /calendars` na v2 — não verificado) | | ✅ |
| Link/convite Google Meet | ❌ — gerado pela integração Google da conta | ❌ | 🟡 configura-se a integração |

### Pipelines e oportunidades

| Operação | API oficial | API interna | UI |
|---|---|---|---|
| Listar pipelines + stages | ✅ | | ✅ |
| Oportunidades de um contacto | ✅ `/opportunities/search` — parâmetros em **snake_case** | | ✅ |
| Criar/mover oportunidade | ✅ upsert/PUT — **validar o stage contra o pipeline** (há stages órfãos) | | ✅ |
| Criar pipeline | ❌ | ❓ | ✅ |

### Conversas e mensagens

| Operação | API oficial | API interna | UI |
|---|---|---|---|
| Threads de conversa | ✅ search + create | | ✅ |
| Enviar SMS / email / WhatsApp texto | ✅ `POST /conversations/messages` | | ✅ |
| Registar chamada na thread | 🟡 exige `conversationProviderId` de app Marketplace; sem ele → **nota** | | ✅ |
| Media WhatsApp (áudio/imagem) | 🟡 só via `whatsapp.media` + `/conversations/messages/upload`; `attachments` falha em silêncio | | ✅ |
| Ler o estado do Conversation AI por conversa | ❌ **não existe em API nenhuma** | ❌ | 🟡 vê-se na UI |
| Transcrição de áudio recebido | ❌ o `.ogg` chega mas o texto não | 🟡 o ficheiro descarrega sem auth; transcrever por fora | ✅ |

### Workflows, triggers, bots

| Operação | API oficial | API interna | UI |
|---|---|---|---|
| Listar workflows (metadados) | ✅ 7 campos, sem passos | ✅ | ✅ |
| Definição completa (passos) | ❌ **não existe** | ✅ `GET /{loc}/{wfId}` | ✅ |
| Criar/editar workflow | ❌ | ✅ PUT substitui **o objecto inteiro** | ✅ |
| Publicar / rascunho | ❌ | ✅ `change-status` — um PUT de edição **não publica** (o motor lê o `fileUrl`) | ✅ |
| Triggers: ler/editar | ❌ | 🟡 GET/PUT funcionam | ✅ |
| Triggers: criar ligado ao workflow | ❌ | ❌ o POST cria um órfão que não liga | ✅ (ou duplicar um workflow que já o tenha) |
| Inscrever contacto | ✅ `POST /contacts/{id}/workflow/{wfId}` — devolve 200 mesmo sem executar | | ✅ |
| Estatísticas de execução | ❌ | ✅ enroll-stats / count-per-step / logs | ✅ |
| Bots (Conversation AI) | ❌ | ✅ `ai-employees/employees` | ✅ |
| Agent Studio | ❌ | ✅ `agent-studio/agents` + versões | ✅ |
| Rotas de canal dos bots | ❌ | ✅ `agent-deployment/routing-config` (escrever com PATCH) | ✅ |

### Conta, instalação e administração

| Operação | API oficial | API interna | UI |
|---|---|---|---|
| App Marketplace: criar/versionar/scopes/acções | ❌ | ❌ | ✅ consola Marketplace |
| Instalação OAuth (consentimento) | 🟡 o fluxo é API; o clique é humano | | ✅ |
| Token por location (agência) | ✅ `/oauth/installedLocations` + `/oauth/locationToken` | | |
| Templates WhatsApp: criar | ❌ | 🟡 `phone-system/whatsapp/location` cria; **não edita nem apaga** | ✅ Meta/GHL UI |
| Templates WhatsApp: aprovação e texto aprovado | ❌ | ❌ | ✅ **só na Meta** |
| Comprar número (LC Phone) / SIP | ❌ | ❓ | ✅ |
| DNS de email (SPF/DKIM/DMARC) + warm-up | ❌ | ❌ | ✅ registo DNS + GHL UI |
| Snapshots | ❌ | ❓ | ✅ |
| A2P / registo de marca, billing, subscrição | ❌ | ❌ | ✅ |
| Utilizadores da location | ✅ só leitura | | ✅ convidar = UI |
| Webhooks (configurar na app) | ❌ config na consola Marketplace | | ✅ |

## Como ler este mapa

Cada "medido" vem de uso real numa conta de produção, com datas de 2026
indicadas nas skills de detalhe. **Se algo aqui parecer errado: medir outra
vez e corrigir o documento, com a medição e a data.** O maior inimigo desta
base de conhecimento é uma afirmação que era verdade há seis meses — várias
sobreviveram meses sem tráfego que as contrariasse.

## As skills desta colecção

| Skill | Quando abrir |
|---|---|
| `ghl-mapa` | sempre primeiro — escolher o caminho |
| `ghl-seguranca-escrita` | **antes de qualquer PUT/POST/PATCH/DELETE** |
| `ghl-api-oficial` | qualquer chamada a `services.leadconnectorhq.com` ou ao MCP oficial |
| `ghl-api-interna` | workflows, triggers, bots, estatísticas de execução |
| `ghl-auth-interna` | token de sessão para a API interna; 401 |
| `ghl-scripts` | correr o kit de scripts ou escrever um script novo |
| `ghl-canais` | SMS, WhatsApp, email, voz — regras por canal |
| `ghl-make` | cenários Make (ou outro orquestrador), blueprints, campanhas |
| `ghl-app-marketplace` | serviço próprio que o GHL chama: acções custom, webhooks, OAuth |
| `ghl-computer-use` | o que só o browser alcança, e como o operar com segurança |
