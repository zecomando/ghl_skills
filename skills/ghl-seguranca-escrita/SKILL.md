---
name: ghl-seguranca-escrita
description: Regras obrigatórias antes de qualquer escrita no GoHighLevel (GHL) — simulação por omissão, allowlist de locations, guarda que aborta em vez de obedecer, verificação por releitura e os falsos verdes conhecidos, segredos fora de workflows e exports, idempotência e quando NUNCA retentar um POST. Ler antes de qualquer PUT, POST, PATCH ou DELETE no GHL, seja por API, script, Make ou browser.
license: MIT
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# Segurança de escrita no GHL

Escrever no CRM é muito mais arriscado do que ler — e o perigo não é a API
recusar. É responder **200** e ter escrito na conta errada, no objecto errado,
ou nada de todo. Estas regras existem porque cada uma destas coisas já
aconteceu numa conta real.

## As cinco regras

### 1. Simulação por omissão

- Scripts: simulam por omissão; escrever exige `--executar`.
- Serviços/apps: uma variável do tipo `GHL_DRY_RUN=true` por defeito, e o modo
  de simulação devolve honestamente "não enviado" — nunca finge sucesso.
- Escrever é sempre um acto explícito, nunca o caminho por defeito.

### 2. Allowlist de locations — a guarda aborta, não obedece

- Uma lista explícita (no kit: `GHL_WRITE_LOCATIONS`) diz onde a escrita pode
  acontecer. **Lista vazia = nenhuma escrita passa.** É o comportamento certo.
- A guarda aborta **antes** de sair tráfego. Uma location fora da lista não é
  "corrigida" nem ignorada: o programa pára e explica.
- Um token com alcance de agência chega a **todas** as sub-contas. Nada na API
  do GHL impede um PUT de aterrar na conta de um cliente — responde 200. A
  allowlist é a única coisa que impede.
- Medido num repositório real: dezenas de scripts liam
  `process.env.GHL_LOCATION_ID || '<id>'` e aceitavam qualquer valor — uma
  variável trocada reapontava todos de uma vez, sem erro.
- **Conferir o objecto pelo servidor entre o GET e o PUT.** Um id vindo de uma
  lista velha, de um backup ou de um copiar-colar pode existir noutra
  sub-conta: não dá 400, dá 200 na conta errada. O `locationId` que o
  **servidor** devolve sobre o objecto é a prova (no kit:
  `garantirDaLocation(objecto, location)`).

### 3. `locationId` explícito em toda a chamada

Sem excepção para "a nossa". Uma escrita sem location declarada é recusada
localmente, antes de sair um byte.

### 4. Um 200 não é prova — verificar pela releitura, sabendo onde ela mente

Procedimento: escrever → GET → conferir o valor novo → e ainda assim duvidar,
porque estes falsos verdes foram medidos:

| Escrita | Falso verde | Prova que vale |
|---|---|---|
| PUT de workflow (API interna) | o GET devolve o objecto editado, mas o motor executa o ficheiro em `fileUrl` — um snapshot **uma versão atrás** | ler o `fileUrl` e procurar lá o texto novo; republicar se ficou atrás (ver `ghl-api-interna`) |
| PUT de workflow com corpo parcial | o campo mudado relê-se bem; as **outras** definições voltaram ao default | enviar o objecto completo (as 11 chaves — ver `ghl-api-interna`) |
| DELETE de marcação | `GET /calendars/events/appointments/{id}` continua a devolver o evento apagado | o `free-slots` voltar a oferecer a hora |
| Mensagem WhatsApp com anexo | a mensagem fica `read`, mas só o texto chegou (`attachments` falha em silêncio) | `altId` com `wamid.*` na mensagem devolvida |
| Inscrição em workflow | 200 mesmo quando `allowMultiple:false` cala a 2.ª inscrição | `count-per-step` (API interna) a contar a entrada |
| Cancelar marcação | `PUT {status:"cancelled"}` é ignorado | `appointmentStatus:"cancelled"` — e conferir o evento devolvido |
| Tag criada | a tag já existia ou o nome colidiu (o GHL põe em minúsculas) | GET e comparar `name.toLowerCase()` |
| DND no contacto | `{dnd:true}` relê-se bem e reverte sozinho mais tarde | `dndSettings` por canal com `status:"active"` |
| Texto de template WhatsApp | o `message` do passo mudou, mas o que sai é o template aprovado na Meta | ver o texto aprovado na Meta |

### 5. Nunca retentar um POST não-idempotente

Um 503 pode acontecer **depois** de a linha ter sido criada. Re-tentar
`POST /calendars/events/appointments` já transformou uma reunião em quatro.

- Replayable por omissão: `GET, HEAD, OPTIONS, PUT, DELETE`.
- Um 429 pode sempre repetir-se (foi recusado antes de o GHL fazer trabalho).
- POST só se repete quando é explicitamente idempotente (`/contacts/upsert`)
  ou leva uma chave nossa que o outro lado deduplica (`idempotencyKey`,
  `altId`).
- Antes de criar, reconfirmar (ex.: o slot ainda está livre); depois de um erro
  ambíguo, **ler** para saber se a escrita aterrou — nunca repetir às cegas.

## Escrever em massa

- Testar em **1** objecto, depois em 10, depois no resto. Endpoints não
  documentados mudam sem aviso.
- Backup (export) antes de qualquer escrita que substitua objectos inteiros.
- Uma sub-conta descartável para experimentar antes de produção.
- Um relatório legível do que vai mudar **antes** de `--executar`, e do que
  mudou depois.

## Segredos

- Nunca versionar `.env`, tokens, exports (`ghl-export/`, `make-export/`) nem
  `*.har`: os exports de workflows trazem **tokens vivos em texto limpo**
  (Bearer de terceiros e access tokens Meta embutidos nos passos de webhook).
  Um `git add -A` distraído publica-os.
- Nunca meter segredos em corpos/headers de passos de workflow, custom values,
  variáveis de cenário Make ou blueprints — tudo isso se exporta.
- Nunca imprimir tokens em logs, relatórios ou respostas ao utilizador.
- Webhooks recebidos: verificar a assinatura (ver `ghl-app-marketplace`);
  autenticação de webhooks no Make vive no keychain, não nos módulos.

## Idempotência — a chave que nos cabe

- Acções custom que originam algo (uma chamada, um SMS) aceitam uma
  `idempotencyKey` estável, derivada de (campanha, contacto) — nunca de um
  timestamp.
- `altId` nos corpos de conversas/notas = o nosso id, para um replay não
  duplicar o registo.
- Webhooks do GHL repetem-se até 12× e fora de ordem → deduplicar por
  `webhookId`.
- Re-correr um cenário/script não pode duplicar: o estado vive num sítio
  (data store, base de dados) + chave estável, não em "correu sem erro".

## Fronteiras

- Contas e sistemas de terceiros: ler é livre quando autorizado; escrever,
  só com ordem explícita do responsável.
- Comportamento de negócio — o que a lead ouve ou recebe (guião, horas,
  abertura, quando desligar, cadências) — não se muda sem ordem. Corrigir
  defeitos técnicos (falso verde, duplicado, opt-out perdido) é trabalho
  normal e regista-se com data.
- Acções irreversíveis (apagar, publicar, enviar em massa, criar templates
  Meta que não se apagam): descrever o efeito e pedir confirmação ao
  utilizador antes.
