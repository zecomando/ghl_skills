# Bots pela API interna — Conversation AI, Agent Studio, Voice AI

Headers: `token-id` (não `Authorization`), `channel: APP`, `source: WEB_USER`,
`version: 2021-07-28`. Token: skill `ghl-auth-interna`.

## Onde vive cada produto

⚠️ **O produto que a UI chama "Conversation AI" NÃO vive no serviço
`conversations-ai`, nem no recurso `/agents`.** Vive em **`ai-employees`**,
recurso **`/employees`**. O `conversations-ai` tem apenas três endpoints
residuais. Os `/agents` que existem são de dois OUTROS produtos.

| Produto | Base (`https://services.leadconnectorhq.com/...`) | Recursos |
|---|---|---|
| Bot clássico (`conversation_ai`) | `ai-employees` | `/employees` + `/actions` |
| Agent Studio (`agent_studio`) | `agent-studio` | `/agents` + `/agents/versions` |
| Voice AI | `voice-ai` | `/agents` + `/actions` (distintos dos anteriores!) |

**A escrita existe** — CRUD completo em todos: `POST /employees`,
`PUT /employees/{id}`, `PUT employees/duplicate/{id}` (sem barra inicial!),
`POST /actions`, `PUT /actions/{id}`, `POST /agents`, `PATCH /agents/{id}`,
`POST /agents/duplicate/{id}`, `POST /agents/versions/{id}/publish`.

**A configuração das acções NÃO está escondida.**
`GET /ai-employees/actions/search?employeeId={id}&skip=0&limit=200&query=`
devolve tudo inline — `calendarId`, `calendarIds`, `workflowIds`,
`triggerWorkflow`, `fallbackCalendarId`. O que parece esconder é a truncagem:
**o `limit` por omissão é 20.** Paginar sempre.

## Escrever num bot clássico — cinco armadilhas (medidas 2026-08-08)

Todas devolvem **200 ou silêncio**; nenhuma dá erro útil.

1. **`fullPrompt` MANDA SOBRE `personality`/`goal`/`instructions`.** Se estiver
   preenchido, o bot corre com ele e ignora os outros três — mesmo que estes
   estejam correctos na API. Os bots que funcionam têm-no **vazio**. Não é
   derivado, ao contrário do que se lê por aí.
2. **`fullPrompt` no mesmo corpo descarta os outros três.** A API responde 200 e
   grava só o `fullPrompt`. São precisos **dois PUT**: os três campos
   primeiro, e depois `{locationId, fullPrompt: ''}` sozinho.
3. **O nome lê-se em `name` e escreve-se em `employeeName`.** Mandar `name` dá
   422. Mesma assimetria das acções (achatadas na leitura, em `details` na
   escrita).
4. **Não espalhar o objecto lido no PUT.** A API rejeita `id`, `name`,
   `employeeType`, `errors`, `rootParentAgentId`, `traceId` e `steps` com 422 em
   vez de os ignorar. Enviar **só** os campos a mudar.
5. **A acção `stopBot` de Goodbye não se apaga.** `DELETE` devolve `"Goodbye
   stop bot action cannot be deleted"` (422). O GHL cria uma em cada bot; só se
   liga ou desliga por `PUT /actions/{id}`.

As acções: `POST /ai-employees/actions` e `PUT /ai-employees/actions/{id}`
querem `{employeeId, locationId, type, name, details}` com o `name` como irmão;
repeti-lo dentro de `details` dá 422 `"details.property name should not
exist"`.

## Criar um bot de raiz — mais três (medidas 2026-08-11)

Ao contrário das de cima, estas **dão 422 com mensagem útil**.

6. **`employeeType` no `POST /employees` só aceita `custom` ou
   `appointment-booking`.** `conversation_ai` — o nome que a UI dá ao produto e
   que aparece noutros sítios da API — dá 422. Ler o tipo de um bot que já
   funciona em vez de adivinhar.
7. **O `POST` não herda configuração nenhuma.** `waitTime`,
   `autoPilotMaxMessages`, `respondToImages`, `respondToAudio`, `sleep*` e
   `botType` ficam nos defaults, que não são os do bot que está a atender leads.
   Copiar do bot de produção — as leads mandam fotos, e um bot com
   `respondToImages` a `false` fica calado.
8. **`details.description` está limitado a 500 caracteres** (422 `"must be
   between 1 and 500 characters long"`), e **`contactUpdateExamples` é
   assimétrico como o resto**: a leitura devolve `{id, name, text}`, a escrita
   rejeita `id` e `name` e exige `type` em `add|update|delete`. Clonar uma
   acção `updateContactField` de um bot para outro passa obrigatoriamente por
   limpar isto.

> A `description` de uma acção `updateContactField` **é o prompt de
> extracção**. Uma que diga só "o primeiro nome da lead" acaba a gravar o nome
> da empresa como nome de pessoa (apanhado a 2026-08-11 numa conversa em que
> ninguém se identificou). Proibir pela negativa — empresa, persona, terceiros
> mencionados, assinaturas — é o que apanha estes casos, e cabe nos 500.

## ⛔ Sem rota de canal, o bot não atende — e não há erro nenhum

O Conversation AI tem **uma rota por canal**. Um canal sem rota **não chega ao
motor de IA**: o gatilho dispara, o workflow atribui o bot, o bot fica
atribuído, e nada acontece. Nenhum log, nenhum erro, nenhum sinal.

Foi isto que manteve um canal de SMS mudo desde que existia (encontrado
2026-08-12): só havia rota para `WhatsApp`. O bot estava bom — o teste
(`interactions/trial`) respondia com o guião certo — e o gatilho disparava em
três segundos.

```http
GET   /agent-deployment/routing-config/configs?locationId={loc}   lista as rotas
POST  /agent-deployment/routing-config/configs                    cria uma rota
PATCH /agent-deployment/routing-config/configs/{id}               muda o bot da rota
```

Corpo do POST: `{locationId, channel, providerId, enabled, agentId,
agentProductType:"conversation_ai", allIdentifiers, specificIdentifiers}` — sem
`deleted`, que dá 422. `channel` e `providerId` iguais (`"SMS"`, `"WhatsApp"`).

**A pista estava na interface**, na lista de agentes: um aviso de que só o
agente principal responde às mensagens de entrada e de que os canais têm de
estar atribuídos a ele. Vale a pena ler os avisos da UI quando a API não
explica o silêncio.

### A rota por omissão lê-se por API; escreve-se com `PATCH`

O `GET` devolve um array com `{id, channel, providerId, enabled, agentId,
agentProductType, allIdentifiers, specificIdentifiers, deleted}` — e o
`agentId` é o bot que atende tudo o que **não** cai num workflow. Incluir isto
em qualquer auditoria: é a porta por onde entram as conversas que ninguém
conta. Medido a 2026-08-11: atendeu uma lead de um segmento com o bot de outro
segmento.

⚠️ **Escreve-se com `PATCH`, não com `PUT`** — e foi só por isso que esteve dois
dias documentado como "só na interface":

| Método | Resposta |
|---|---|
| `PUT /configs/{id}` | 404 |
| `PUT /configs` | 404 |
| **`PATCH /configs/{id}`** | **funciona** — 422 se mandares campos a mais |
| `POST /configs` | responde (422 a `deleted`) |

O `PATCH` rejeita `locationId`, `channel`, `providerId` e `deleted`. Manda só o
que muda: `{agentId, agentProductType}`.

> **Lição de método:** um 404 num endpoint interno pode ser o método errado, não
> a ausência da funcionalidade. Antes de escrever "isto não dá por API", tentar
> os quatro verbos — o 422 é o sinal de que há ali alguém a ouvir.

## Testar um bot sem falar com ninguém

`POST /ai-employees/interactions/trial` (sem barra inicial no frontend) com
`{employeeId, knowledgeBaseIds, messageList}`. Cada mensagem é
**`{body, direction}`**, com `direction` em `inbound|outbound|log_action` —
`role`/`content` e `type`/`message` dão 422. Devolve `{suggestions:[...]}`.

Usa o prompt real do bot, portanto serve de teste de fumo antes de entregar:
manda a 1.ª mensagem como `outbound` e a resposta da lead como `inbound` para
dar contexto de conversa.

## O que não existe

**Não há endpoint que LEIA o estado do Conversation AI por conversa.** Sondados
sete (`ai-employees/conversation-status`, `…/employees/status`,
`conversations/{id}/ai-status`, `…/ai-bot`, `ai-employees/interactions[/search]`),
todos 404 ou 400. Escreve-se pelo passo de workflow
`update_conversation_ai_status` (`status: active|inactive`), não se lê. Só se vê
na UI.

⚠️ **Escrever num CRM vivo é muito mais arriscado do que ler.** Testar numa
sub-conta descartável antes de produção, e não assumir que um `PUT` é parcial.
