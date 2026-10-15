# API oficial — endpoints e notas medidas

Base `https://services.leadconnectorhq.com`. Header `Version` por endpoint:
ver o `SKILL.md`. Cada nota "medida" vem de uso em produção (2026); quando a
plataforma mudar, medir outra vez e corrigir com a data.

## Contactos

| Endpoint | Notas medidas |
|---|---|
| `GET /contacts/{id}` | **sem** filtro `locationId` — o endpoint não aceita o parâmetro (422). Conferir o `locationId` da resposta, ou um contacto de outra sub-conta passa por nosso |
| `GET /contacts/search/duplicate?locationId&number` | lookup canónico por telefone. O `+` tem de ir percent-encoded (passar por parâmetros de query, nunca colar no URL). Devolve um contacto "slim", sem `dnd`/`dndSettings` |
| `POST /contacts/upsert` | o caminho de escrita (idempotente: converge pelo telefone/email). Com duplicados bloqueados na location, `POST /contacts/` dá **400** — num caso real, um cenário Make engoliu esse 400 e ~40% das linhas ficaram presas como "processadas" (2026-08) |
| `POST /contacts/search` | é uma leitura (apesar do POST). A gramática do corpo não está bem documentada — preferir `search/duplicate` por telefone |
| `POST/DELETE /contacts/{id}/tags` | corpo `{tags:[...]}` com **nomes**, nunca ids |
| `POST /contacts/{id}/notes` | sem `locationId` no corpo — o token faz o âmbito |
| `PUT /contacts/{id}` | DND escreve-se em `dndSettings` por canal, nunca só no booleano `dnd` |
| `POST /contacts/{id}/workflow/{wfId}` | inscreve — e devolve **200 mesmo quando o contacto não entra** (`allowMultiple:false` cala a 2.ª vez). Prova: `count-per-step` na API interna |
| `DELETE /contacts/{id}/workflow/{wfId}` | tira contactos presos num passo que entretanto foi removido |

**Telefones: nunca concatenar prefixo.** Numa conta medida, todos os telefones
já estavam em E.164; um passo de workflow com `"+351{{contact.phone}}"`
produzia `+351+351…` em dezenas de passos. Ler o valor, validar E.164
(`^\+[1-9]\d{7,14}$`; por país, ex.: Portugal `^\+351\d{9}$`), recusar o resto.

**Nomes:** em listas de leads obtidas por scraping, `firstName`/`contactName`
trazem muitas vezes lixo de página ("Links Úteis", "QUEM SOMOS"). Filtrar com
um teste conservador de nome de pessoa, ou usar `companyName` quando estiver
preenchido.

**DND:** ler o booleano **e** `dndSettings` por canal (`status:"active"` =
DND ligado). Um payload sem nenhum dos dois é desconhecido — e desconhecido
**bloqueia** o envio. O booleano `dnd` reverte-se sozinho (ver `ghl-canais`).

## Calendários e marcações

| Endpoint | Notas medidas |
|---|---|
| `GET /calendars/{id}/free-slots` | `startDate`/`endDate` em **epoch ms** + `timezone` IANA explícita (sem ela as fronteiras do dia podem deslocar-se 1 h durante metade do ano). Janela máx. **31 dias**. Devolve um mapa por data + um `traceId` intruso no meio das datas. Lista slots: **nunca** responde sim/não a uma hora concreta |
| `GET /calendars/events` | `startTime`/`endTime` em **ms** (em segundos devolve uma janela em ~1970 = lista vazia que parece "sem marcações"). O início é respeitado **à granularidade do dia**, não do instante — filtrar outra vez do lado de cá |
| `GET /calendars/events/appointments/{id}` | ⚠️ depois de um DELETE **continua a devolver o evento** (medido 2026-08-20). A prova de apagado é o `free-slots` voltar a oferecer a hora |
| `POST /calendars/events/appointments` | `startTime` ISO **com offset, nunca `Z`** (na inscrição em workflow dá 422; noutros sítios aterra na hora errada). `appointmentStatus:"confirmed"`, `toNotify`. **Sem chave de idempotência** — reconfirmar o slot antes, nunca repetir |
| `PUT /calendars/events/appointments/{id}` | remarcar `{startTime}` ou cancelar `{appointmentStatus:"cancelled"}` (`{status:"cancelled"}` é ignorado). 200 ≠ prova — conferir o evento devolvido |
| `DELETE /calendars/events/{id}` | **hard delete** — leva o histórico. Cancelar é um PUT de estado |
| `GET /calendars` | lista de calendários |

- Estados vivos: `confirmed`/`new`. Num calendário real, quase metade dos
  eventos estavam `cancelled`, `noshow` ou `invalid` — "tem evento" ≠ "tem
  reunião".
- ⚠️ O endpoint devolve **as duas** grafias `appointmentStatus` e
  `appoinmentStatus` (sic) — ler a correcta, com recurso à que tem o erro.
- Um evento no GHL **não prova o convite do Google**: num calendário com
  `google_conference`, o link Meet é gerado pela integração Google da conta.
- Criar calendários/grupos (`POST /calendars`) existe na v2 mas não foi
  verificado por nós.

## Oportunidades e pipelines

| Endpoint | Notas medidas |
|---|---|
| `GET /opportunities/pipelines?locationId` | pipelines + stages |
| `GET /opportunities/search` | parâmetros `location_id`, `contact_id`, `pipeline_id` em **snake_case** — o único endpoint com esta convenção; camelCase dá 422. Paginação: `meta.nextPage` + `startAfter`/`startAfterId` |
| `POST /opportunities/upsert` | o schema publicado omite `contactId` e marca `followers*` como obrigatórios — erros de documentação: enviar `contactId`, não enviar followers |
| `PUT /opportunities/{id}` | mover de stage: enviar o `pipelineId` **dono do stage** + `pipelineStageId` |

⚠️ **Stages órfãos existem**: um workflow em produção movia oportunidades para
um stage que não pertencia a nenhum pipeline da conta — aterravam num sítio
que nenhum board mostra. Validar todo o stage id contra os pipelines lidos da
conta **antes** de escrever; quando o stage pertence a outro pipeline,
escrever no dono. No kit: `ghl-pipelines.mjs --stage=<id>`.

## Conversas

| Endpoint | Notas medidas |
|---|---|
| `GET /conversations/search?locationId&contactId` | threads |
| `POST /conversations/` | criar thread `{locationId, contactId}` |
| `POST /conversations/messages` | enviar SMS / Email / WhatsApp. Media WhatsApp: só com `whatsapp.media` (ver `ghl-canais`) |
| `POST /conversations/messages/inbound` | exige `type`, `conversationId`, `contactId`, `conversationProviderId` |
| `POST /conversations/messages/outbound` | só `type:"Call"`, **sem campo de corpo** — um resumo da chamada não cabe aqui, vai numa nota |
| `POST /conversations/messages/upload` | multipart `conversationId` + `files` → `uploadedFiles{nome:url}`. ⚠️ **não** enviar `disableMaxFileSize`/`disableMaxFiles` — com PIT/OAuth dá 400 `CONVERSATIONS_MSG_UPLOAD_PARAM_CHANGE_BLOCKED` |
| `GET /conversations/messages/email/{id}` | reconciliação de envio de email |

- Enum `call.status` verificado: `pending, completed, answered, busy,
  no-answer, failed, canceled, voicemail`.
- `conversationProviderId` só existe com uma app Marketplace registada como
  provider de Call. Sem ele, `type:"Call"` não se escreve → **nota** como
  recurso (nunca perder o registo em silêncio).
- `altId` no corpo = o nosso id, para um replay não duplicar o registo.

## Tags, campos, locations, users, workflows

- `GET/POST /locations/{id}/tags` — criar tag por nome (o GHL põe em
  minúsculas; comparar sempre em minúsculas). Paginação `limit`/`offset` pode
  dar 422 — cair para a chamada sem parâmetros.
- `GET /locations/{id}/customFields` — catálogo completo (centenas de campos
  numa location madura). Guardar em cache: muda raramente. `fieldKey` resolve
  com e sem o prefixo `contact.`/`opportunity.`.
- Escrever um campo personalizado no contacto: no upsert,
  `{customFields:[{id, field_value}]}`.
- Custom values da location: **não** estão na API oficial (ver `ghl-mapa`).
- `GET /locations/{id}` — nome legível da sub-conta.
- `GET /users` — só leitura; convidar utilizadores é UI.
- `GET /workflows` — **só metadados** (7 campos). A definição não existe aqui.
- OAuth de agência: `GET /oauth/installedLocations?companyId&appId&limit&skip`
  e `POST /oauth/locationToken` — um token de empresa só serve para isto; o
  `user_type` na troca tem de bater com a forma de instalação.

## Webhooks (GHL → nós)

- Assinatura **Ed25519** em `X-GHL-Signature` sobre os **bytes exactos** do
  corpo — ler cru antes de fazer parse (re-serializar parte a assinatura). O
  `X-WH-Signature` (RSA) é legado, com fim anunciado para 2026-09-01.
- Deduplicação obrigatória por `webhookId` (recurso: sha256 do corpo): o GHL
  repete **até 12 vezes**, com backoff e jitter, sem garantia de ordem, sempre
  que a resposta não é 2xx ou não chega a tempo.
- Um webhook com mais de 10 000 entregas em 3 dias e menos de 90% de sucesso
  recebe um aviso; à segunda, a entrega é **pausada** até ser reactivada à mão.
- Um 5xx nosso pede nova tentativa; um 200 confirma. Para eventos que não se
  podem perder (STOP de SMS), gravar **antes** de responder 200.

Implementação do lado do serviço: `ghl-app-marketplace`.
