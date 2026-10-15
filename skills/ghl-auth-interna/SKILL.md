---
name: ghl-auth-interna
description: Obter e renovar automaticamente o token de sessão do GoHighLevel (GHL) para a API interna do editor — workflows, bots, Conversation AI, Agent Studio — sem copiar tokens do DevTools de hora a hora. Usar antes de qualquer chamada à API interna e sempre que aparecer um 401, "token expirou", TOKEN_EXPIRED ou INVALID_REFRESH_TOKEN. Cobre o refresh token Firebase, que header usar e o que fazer quando a sessão é revogada.
license: MIT
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# Token de sessão do GHL (API interna) sem intervenção manual

A API oficial usa PIT/OAuth (ver `ghl-api-oficial`). A **API interna** — a que
o próprio editor do GHL usa — autentica com o token de sessão do utilizador.
Esta skill é sobre esse token.

## A regra

**Nunca pedir ao utilizador para copiar um token de acesso do DevTools.** Dura
~1 h e inviabiliza qualquer trabalho longo. Pede-se **uma vez** o refresh
token, que dura semanas, e a partir daí renova-se sozinho.

Com o kit desta colecção (skill `ghl-scripts`):

```js
import { obterTokenSessao } from './lib/sessao.mjs';
const token = await obterTokenSessao();   // usa cache se válido, renova se preciso
```

Diagnóstico: `node <pasta da skill ghl-scripts>/scripts/ghl-verificar.mjs`.

## Como funciona

O GHL autentica no Firebase, projecto **`highlevel-backend`** (produção). O
token de acesso (`id_token`) dura ~1 h; o refresh token dura até a sessão ser
revogada (logout, mudança de password, sessão terminada). A renovação é o
mecanismo standard do Firebase:

```
POST https://securetoken.googleapis.com/v1/token?key=<chave web Firebase>
Content-Type: application/x-www-form-urlencoded
grant_type=refresh_token&refresh_token=<refresh token>
-> { id_token, refresh_token, expires_in }
```

A chave web do Firebase é pública por desenho (está embutida no frontend do
GHL) — não é um segredo. ⚠️ Existe também um projecto `highlevel-staging` com
outra chave; confirmar sempre pelo `projectId`, não pela ordem em que aparecem.

## O único passo manual (uma vez por sessão — semanas)

Feito **pela pessoa dona da conta**, com sessão iniciada no GHL:

```
DevTools (F12) > Application > IndexedDB > firebaseLocalStorageDb
  > firebaseLocalStorage > abrir a entrada "firebase:authUser:..."
    value.stsTokenManager.refreshToken   ->  GHL_REFRESH_TOKEN
    value.apiKey                         ->  GHL_FIREBASE_KEY
```

Os dois valores vão para o `.env` do projecto (nunca para o Git).

- **Não há forma de automatizar esta captura** sem fazer login, e o login não
  se faz em nome do utilizador. Se for preciso pedir, pede-se só isto — nunca
  o token de acesso, nunca a password.
- Um agente com acesso ao browser **não** deve ir buscar este valor sozinho: é
  uma credencial da conta. Quem a copia é a pessoa.

## Que header usar

| Token | Header | Onde funciona |
|---|---|---|
| `id_token` do Firebase (o que o refresh produz) | `token-id: <token>` | `backend.leadconnectorhq.com` e `services.leadconnectorhq.com` — workflows **e** bots (confirmado 2026-08-08) |
| JWT v2 de sessão do GHL (claims `authClass`, `authClassId`, `v:"2"`) | `Authorization: Bearer <token>` | o que a UI envia ao serviço de workflows |

Com o `id_token` do Firebase, usar **sempre `token-id`**: em
`Authorization: Bearer` dá 401. (Uma versão anterior desta documentação dizia
que o serviço de workflows exigia `Bearer` — estava errada; corrigido por teste
real a 2026-08-08.)

Headers comuns: `channel: APP`, `source: WEB_USER`, e `version` conforme o
serviço (`2021-04-15` workflows, `2021-07-28` bots).

O `user_id` (necessário, por exemplo, no `updatedBy` ao publicar um workflow)
lê-se das claims do próprio token.

## Ler um 401 e um 422 correctamente

- **401 / 403** — o token não serve. Mexer no token.
- **Qualquer outra coisa, incluindo 422** — a autenticação **passou**; o pedido
  é que está mal formado. Não mexer no token.

Excepção, na API oficial: `401 "version header was not found."` é falta do
header `Version`, não do token (medido 2026-10-15).

Isto custou tempo real: muitos endpoints da API oficial devolvem
`422 {"message":["property skip should not exist"]}` para query params que
não conhecem, em vez de os ignorar (a API interna, no `/list`, ignora-os —
medido 2026-10-15).
Confundir isso com falha de autenticação leva a caçar o token errado durante
horas.

## Quando falha

| Erro | Significado | Acção |
|---|---|---|
| `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `USER_DISABLED` | a sessão foi revogada | pedir um `GHL_REFRESH_TOKEN` novo; repetir não resolve |
| 401 com token válido | header errado para aquele tipo de token | ver a tabela acima |
| 403 | permissões do utilizador no GHL | não é problema de token |

## Segurança

- O refresh token **vale por uma sessão inteira**: quem o tiver entra na conta.
  Tratar como uma password.
- Vive no `.env` (no `.gitignore`); o kit guarda o token renovado numa cache
  fora do projecto (`~/.ghl-skills/`). Nunca imprimir em logs nem meter em
  relatórios.
- Suspeita de exposição: terminar sessão no GHL revoga-o de imediato.
- Isto é automatizar o acesso do próprio utilizador à própria conta, como
  qualquer SDK faz. Não serve para contas de terceiros. Ver os limites éticos
  em `ghl-api-interna`.
