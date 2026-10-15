---
name: ghl-app-marketplace
description: Construir e ligar um serviço próprio ao GoHighLevel (GHL) como app Marketplace — acções custom de workflow (por exemplo, originar uma chamada de voz ou um SMS), webhooks do GHL (assinatura Ed25519, deduplicação, auto-pausa), instalação OAuth por location ou agência, e provider de conversas. Usar ao expor endpoints que o GHL chama, ao ligar um workflow ou cenário Make a um serviço externo, ou ao mexer em tokens OAuth de uma app.
license: MIT
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# Um serviço próprio ligado ao GHL (app Marketplace)

Quando a automação precisa de algo que o GHL não faz (ex.: um agente de voz
próprio), o padrão é um serviço teu que o GHL chama por três portas:

1. **Acções custom de workflow** — um passo de workflow que faz `POST` ao teu
   endpoint.
2. **Webhooks** — o GHL avisa-te de eventos (mensagem recebida, contacto
   alterado, …).
3. **Instalação OAuth** — cada location (ou a agência) autoriza a tua app e tu
   recebes tokens para a API oficial.

A configuração da app (scopes, redirect URLs, acções custom, webhook URL,
eventos, provider de conversas, publicar versão) é **só na consola
Marketplace** — ver `ghl-computer-use`. Sem a acção registada lá, nenhum
workflow a consegue chamar.

## Acções custom: o contrato que evita incidentes

Exemplo real: uma acção `POST /actions/outbound-call` que um workflow (ou
um cenário Make) invoca para originar uma chamada.

Pedido mínimo:

```json
{
  "locationId": "...",
  "contactId": "...",
  "agent": "...",
  "idempotencyKey": "estavel-por-campanha-e-contacto"
}
```

Regras medidas:

- **`idempotencyKey` estável** — derivada de (campanha, contacto), nunca de um
  timestamp. É o que impede uma 2.ª chamada à mesma lead num re-run.
- **O telefone relê-se do GHL dentro do handler** e tem de ser E.164 válido —
  o pedido **não** pode trazer um telefone alternativo. A fonte da verdade é o
  CRM no momento da acção.
- **Caller id / remetente só da configuração do servidor.** Nunca do pedido.
- `locationId` tem de estar na allowlist de escrita; o modo de simulação
  (`GHL_DRY_RUN=true`) bloqueia a originação **e diz que bloqueou** — nunca
  finge sucesso.
- No workflow: `saveResponse: true` — sem ele o passo seguinte (ou o cenário)
  não vê o resultado.
- **`system__user_id` identifica a lead; `system__caller_id` não** — medido;
  não usar o caller id para resolver o contacto.
- Segredos nunca em corpos/headers do passo de workflow: a acção autentica-se
  pela configuração da app, não por segredos no passo (que se exportariam).
- Responder **200 só quando o GHL confirmou** o que a acção prometia (ex.: a
  mensagem foi aceite, a nota foi criada). Um 200 optimista é um falso verde
  para o workflow inteiro.

O mesmo padrão serve para acções de SMS e outras: mesma guarda de location,
mesma simulação, mesma idempotência.

## Webhooks GHL → serviço

- **Verificar a assinatura Ed25519** em `X-GHL-Signature` sobre os **bytes
  crus** do corpo, antes de qualquer parse (re-serializar o JSON parte a
  assinatura). A chave pública vem na documentação do GHL. O header legado
  `X-WH-Signature` (RSA) tem fim anunciado para 2026-09-01 — não construir
  nada novo sobre ele.

  ```js
  import { verify } from 'node:crypto';
  // rawBody: Buffer com os bytes exactos recebidos; publicKeyPem: chave pública Ed25519 do GHL
  const ok = verify(null, rawBody, publicKeyPem, Buffer.from(req.headers['x-ghl-signature'], 'base64'));
  if (!ok) return res.status(401).end();
  ```

- **Deduplicar por `webhookId`** (fallback: sha256 do corpo): o GHL repete até
  **12×**, com jitter, sem ordem garantida.
- **Gravar antes de responder 200** nos eventos que não se podem perder
  (STOP/opt-out): um 200 seguido de crash perde o evento para sempre.
- **Auto-pausa**: o GHL pausa um webhook com mais de 10 000 entregas e menos de
  90% de sucesso em dois períodos consecutivos de 3 dias — reactivar é manual,
  na consola. Responder depressa; trabalho pesado para segundo plano.
- Um 5xx nosso pede nova tentativa; um 200 confirma.

## OAuth e instalação

- Callback: `{URL pública do serviço}/.../oauth/callback`, registado na consola.
- O `user_type` na troca de token tem de bater com a forma de instalação
  (`Company` vs `Location`).
- Tokens **por location**; o access token expira (~24 h) e o **refresh token é
  single-use e roda a cada troca** — dois refreshes concorrentes para a mesma
  location matam um token para sempre. Serializar o refresh por location (um
  lock por location).
- Padrão útil: tentar OAuth e, se a location não tiver a app instalada, cair
  para um PIT dessa location.
- Instalação em massa por agência: `GET /oauth/installedLocations` +
  `POST /oauth/locationToken` (ver `ghl-api-oficial`).
- Scopes: só os que têm chamada no código. Reinstalar depois de mudar scopes é
  na UI.

## Provider de conversas

Registar a app como **conversation provider** (tipo Call/SMS) na consola dá um
`conversationProviderId`. É o que permite escrever mensagens `type:"Call"` nas
conversas e usar um gateway de SMS próprio. Sem ele, registar a chamada como
**nota** — nunca perder o registo em silêncio. Um provider custom de SMS entra
nas conversas como `type: 20`, que os triggers por `message.type` não apanham
(ver `ghl-api-interna`, armadilha 14).

## Ferramentas internas (opcional)

As operações do serviço (criar, inspeccionar, operar agentes/campanhas) podem
ser expostas também como servidor MCP para o tooling interno — sempre com a
mesma guarda de location e a mesma simulação. Não é uma superfície para o GHL.

## Checklist para ligar um workflow novo a uma acção custom

1. Acção registada na consola Marketplace (se ainda não existir) — UI.
2. `locationId` na allowlist de escrita do serviço.
3. `idempotencyKey` estável no corpo do passo.
4. `saveResponse: true`.
5. O telefone do contacto está em E.164 (o serviço relê — mas testar com um
   contacto real de teste).
6. Caller id / remetente configurados no servidor.
7. Produção: tirar a simulação **só** depois de um run simulado verde.
8. Verificar pela releitura: a chamada/mensagem aconteceu? O registo (nota ou
   `type:"Call"`) aterrou no contacto certo da location certa?
