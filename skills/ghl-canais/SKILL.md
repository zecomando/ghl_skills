---
name: ghl-canais
description: Regras e armadilhas por canal no GoHighLevel (GHL) — SMS (A2P, opt-out, janelas), WhatsApp (templates Meta, janela de 24 h, envio de media, áudio de entrada, quota por WABA), email (DNS, warm-up, reconciliação) e voz (caller id, idempotência, registo da chamada). Usar antes de enviar qualquer mensagem ou chamada por estes canais, ou quando uma mensagem "enviada" não chegou.
license: MIT
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# Canais: SMS, WhatsApp, email, voz

Cada canal falha de maneira diferente, e a maioria das falhas é
**silenciosa** — a mensagem "enviada" que nunca chegou. Por canal: o que se
pode fazer e onde a plataforma mente.

## Regras transversais

- **Opt-out é por canal.** Usar `dndSettings` por canal
  (`status:"active"` = DND ligado). O booleano `dnd` do contacto reverte-se
  sozinho e não prova nada (ver abaixo).
- **Um contacto sem `dnd` nem `dndSettings` no payload é desconhecido — e
  desconhecido bloqueia** o envio; nunca assumir consentimento.
  `GET /contacts/search/duplicate` devolve um contacto "slim" sem os dois
  campos: reler por id antes de decidir.
- Se o opt-out usa uma tag (ex.: `nao_ligar`), confirmar que a tag existe — numa
  conta medida não existia e só foi criada na primeira utilização.
- **Telefone: nunca concatenar prefixo.** Ler o valor, validar E.164
  (`^\+[1-9]\d{7,14}$`; mais apertado por país, ex.: Portugal `^\+351\d{9}$`),
  recusar o resto. Um passo com `"+351{{contact.phone}}"` produziu
  `+351+3519XXXXXXXX` em dezenas de passos de vários workflows.
- **Janelas, ritmo e quotas são regras de negócio.** Vivem num só sítio (o
  orquestrador — workflow, cenário Make, serviço) e não se improvisam num
  script avulso.

## SMS

| Pode-se | Não se pode / armadilha |
|---|---|
| Enviar via `POST /conversations/messages` (`type: "SMS"`) ou passo de workflow | A2P / registo de marca é UI/conta — sem ele, entrega degradada **sem erro** |
| Inbound via webhook do GHL → orquestrador (ex.: cenário Make) | O GHL repete webhooks até 12× → deduplicar |
| Opt-out: workflow escuta STOP, marca `dndSettings.SMS` + tag | O opt-out tem de ficar gravado **antes** do 200 ao webhook — perdê-lo manda SMS a quem disse STOP |
| Corrigir triggers de SMS pela API interna (`ghl-api-interna`) | `workflowsActionType` fica por vezes com lixo e parte a publicação — ver armadilha 9 de `ghl-api-interna` |
| Corpo do SMS vai inline no passo — o que se lê é o que sai | Acima de 160 caracteres parte em vários SMS; com caracteres fora do alfabeto GSM (vários acentos portugueses, emoji) o limite desce para 70 por SMS |

Um provider de SMS externo (custom provider) entra nas conversas como
`type: 20` e **não** é apanhado por triggers com condição `message.type` — ver
a armadilha 14 de `ghl-api-interna`.

## WhatsApp (WABA via LC Phone)

| Pode-se | Não se pode / armadilha |
|---|---|
| Enviar texto via `POST /conversations/messages` | Fora da janela de 24 h só **template aprovado** — a API aceita o texto livre e a Meta recusa sem erro visível |
| Criar template pela API interna (`phone-system/whatsapp/location`) | **Editar/apagar template: não existe em API nenhuma** — um template errado = template novo + 24–48 h de aprovação. Provar o texto antes de submeter |
| Enviar media (áudio, imagem) via `whatsapp.media` + `/conversations/messages/upload` | `attachments` na mensagem **falha em silêncio** (fica `read`, chega só o texto). Procedimento certo em [references/whatsapp.md](references/whatsapp.md) |
| Receber áudio: o `.ogg` chega à API e descarrega sem autenticação; transcrever por fora | O GHL entrega o ficheiro mas **não o texto** — a UI transcreve, a API não |
| Segmentar antes de enviar quem não tem WhatsApp | Número sem WhatsApp recebe "enviado" e nada chega — segmentar antes, não depois |
| Passo `whatsapp_v2` num workflow | O `message` do passo é só pré-visualização: **o que sai é o texto do template aprovado na Meta**. Varrimentos de texto no GHL não o vêem |

**Quotas são da Meta, não do GHL.**

- O tecto diário de mensagens de iniciativa é por número/WABA e muda com a
  qualidade — lê-se do lado da Meta (WhatsApp Manager, ou o
  `messaging_limit_tier` dos números na Graph API).
- **A criação de templates também tem tecto por WABA:** depois de muitos
  templates em poucos dias, o POST dá 422 com `error_subcode 3835016` ("This
  WhatsApp business account is restricted from creating a new template"). Os
  números da mesma WABA partilham a quota; mais quota = outra WABA, que vive
  noutra sub-conta.
- Scripts que trabalham várias WABAs/sub-contas ("frota") recebem a location
  **por argumento explícito** e validam-na contra uma lista declarada — nunca
  por variável de ambiente. Um script de frota sem location explícita opera a
  frota inteira por acidente. E os templates criados ficam lá para sempre.

## Email

| Pode-se | Não se pode / armadilha |
|---|---|
| Enviar via `POST /conversations/messages` (`type: "Email"`) ou workflow | SPF/DKIM/DMARC + domínio de envio: **só UI + DNS** — sem DNS, cai em spam sem erro |
| Reconciliar o estado: `GET /conversations/messages/email/{id}` | "Enviado" ≠ entregue — bounces e queixas vivem no provider, não na API |
| Campanhas por workflow ou script em lotes | Warm-up de domínio novo é manual e demora semanas — não há API para reputação |

## Voz (chamadas outbound por uma app própria)

Chamadas originadas por um serviço de voz próprio, ligado ao GHL por acção
custom de workflow (contrato e checklist em `ghl-app-marketplace`):

| Pode-se | Não se pode / armadilha |
|---|---|
| Originar por acção custom de workflow ou pelo orquestrador | Caller id **só** da configuração do servidor — o pedido nunca traz um número alternativo |
| Idempotência por `idempotencyKey` estável (campanha + contacto) | Re-correr um workflow sem chave = segunda chamada à mesma lead |
| Registar a chamada na conversa: `type:"Call"` com `conversationProviderId` | Sem provider registado (app Marketplace), `type:"Call"` não se escreve → registar como **nota**; nunca perder o registo em silêncio |
| No workflow, `system__user_id` identifica a lead | `system__caller_id` **não** é a lead — medido, não usar para resolver o contacto |

Simulação (dry-run) bloqueia a originação — e diz que bloqueou.

## DND: o booleano mente

⛔ **`PUT /contacts/{id}` com `{dnd: true}` NÃO trava o bot — e reverte
sozinho.** Medido a 2026-08-13: posto a `true` e confirmado por releitura; mais
de uma hora depois entrou uma mensagem e o bot respondeu duas vezes. Releitura nessa
altura: `dnd: false` e `dndSettings: {"WhatsApp":{"status":"inactive"}}`. O
booleano de topo não é o que manda no canal.

Escrever `dndSettings` por canal, com `status: "active"` a significar DND
LIGADO:

```json
{ "dnd": true,
  "dndSettings": { "WhatsApp": {"status":"active"}, "SMS": {"status":"active"},
                   "Call": {"status":"active"}, "Email": {"status":"active"} } }
```

Não ficou determinado o que reverteu o booleano (hipótese: a própria mensagem
de entrada). Para certeza absoluta num contacto de teste, apagá-lo.

## Onde vivem as regras de negócio

Guião, horas propostas, abertura, momento de desligar, cadências — são
comportamento de negócio, vivem nos bots/cenários e mudam por decisão do
responsável, com registo datado. Corrigir defeitos técnicos (falso verde,
duplicado, opt-out perdido) é trabalho normal e regista-se.
