# Workflows pela API interna — referência completa

Base: `https://backend.leadconnectorhq.com/workflow`. Headers e token: ver
`SKILL.md` desta skill e a skill `ghl-auth-interna`.

## Endpoints

| Operação | Método e caminho |
|---|---|
| Listar | `GET /{loc}/list` → `{count, rows[], isLocationRateLimited}` (parâmetros desconhecidos são ignorados — medido 2026-10-15) |
| **Definição completa** | `GET /{loc}/{workflowId}` |
| **Triggers** (recurso à parte!) | `GET /{loc}/trigger?workflowId={id}` |
| Editar trigger | `PUT /{loc}/trigger/{triggerId}` |
| Apagar trigger | `DELETE /{loc}/trigger/{triggerId}` |
| Criar | `POST /{loc}` |
| Actualizar | `PUT /{loc}/{workflowId}` (o `version` do corpo tem de coincidir) |
| Auto-save | `PUT /{loc}/{workflowId}/auto-save` |
| Publicar / rascunho | `PUT /{loc}/change-status/{workflowId}` |
| Renomear | `PUT /{loc}/rename-workflow/{workflowId}` |
| Apagar | `DELETE /{loc}/{workflowId}?userId={userId}` |
| Recuperar | `PUT /{loc}/{workflowId}/recover` |
| Copiar | `POST /{loc}/{workflowId}/copy-workflow` |
| Validar | `POST /{loc}/validate-assets` |
| Versões do próprio workflow | `GET /{loc}/{workflowId}/history` (não é histórico de execuções) |

Parâmetros do `list`: `type=workflow, parentId, search, limit, offset, status,
sortBy, sortOrder, includeCustomObjects=true, includeObjectiveBuilder=true`.
Truque: `status=deleted` lista os apagados.

## Estatísticas: quantos contactos passaram por um workflow

Serviço **diferente** — base `https://backend.leadconnectorhq.com/workflows`
(plural, sem `{loc}` no caminho):

| Operação | Método e caminho |
|---|---|
| **Inscrições por workflow** | `GET /workflows/status/search/enroll-stats?locationId={loc}&workflowIds[]=..` |
| Contactos por passo | `GET /workflows/status/search/count-per-step?locationId={loc}&workflowId=..` |
| Logs de execução | `GET /workflows/logs/v2?locationId={loc}&workflowId=..` |

`enroll-stats` devolve `[{total, finished, workflowId}]`. Três coisas que
enganam:

1. **A resposta omite os workflows com zero.** Ausência = nunca entrou lá
   ninguém, desde sempre. É o sinal mais forte que há para "isto é lixo" — a
   API oficial não expõe nada disto.
2. `workflowIds` **tem de ser array** (`workflowIds[]=a&workflowIds[]=b`).
   Separado por vírgulas dá 422. O editor parte a lista em blocos; 20 por
   pedido passa bem.
3. O contador **cobre a vida toda** da conta, não os últimos 30 dias
   (verificado com workflows criados em 2024). O que só retém 30 dias é o
   *histórico de inscrições* que a UI mostra — coisa diferente.

## Armadilhas (aprendidas a sério)

1. **Os triggers não vêm no GET do workflow.** Vem sempre `triggers: []`. Têm
   endpoint próprio. Quem exportar só o workflow fica com o *o quê* e perde o
   *quando*.
2. **Ignorar o `triggersFilePath`.** Aponta para um ficheiro no Firebase
   Storage que pode estar desactualizado (viram-se cópias de importações
   antigas, com outro `location_id`). A API é a fonte fiável.
3. **Os ficheiros no Firebase Storage respondem sem autenticação.** Quem souber
   o caminho (derivável de `locationId` + `workflowId`) lê a definição. Não é
   para explorar; é saber que esses dados estão menos protegidos.
4. **As definições contêm segredos vivos** — tokens Bearer e access tokens Meta
   embutidos nos passos de webhook, em texto limpo. Nunca versionar exports.
5. **503 esporádicos.** Retry com backoff em 5xx, não só em 429. Não se viu
   rate limit apertado, mas manter ritmo conservador.
6. **A escrita é destrutiva:** o `PUT` substitui o objecto inteiro e valida
   `version`. Não escrever sem backup.
7. **Endpoints não documentados podem mudar sem aviso.** Testar 1 workflow
   antes de centenas.
8. ⚠️ **Editar um workflow publicado NÃO o publica.** O `PUT /{loc}/{id}`
   grava, devolve `status: published` e uma releitura confirma o texto novo —
   e o motor continua a executar o anterior. Ele não lê o documento: lê o
   ficheiro em `fileUrl`, cujo `filePath` fica **uma versão atrás**, no último
   snapshot efectivamente publicado. Destapa-se com
   `PUT /{loc}/change-status/{id}` + `{status:'published', updatedBy:<userId>}`.
   **A verificação válida é ir buscar o `fileUrl` e procurar lá o texto novo**
   — reler o documento dá falso verde. Custou horas a 2026-08-10 e só apareceu
   porque uma lead real recebeu o texto antigo. No kit:
   `ghl-workflow-republicar.mjs`.
9. ⚠️ **`workflowsActionType: "INTERNAL"` só em ALGUNS tipos de passo — não em
   todos.** Sem ele onde é preciso, `change-status` rejeita com *"action has a
   corrupted type"*; **com ele onde não pertence, o editor deixa de abrir o
   workflow** (`Cannot read properties of undefined (reading 'icon')` em
   `WorkflowTreeV2`), porque a UI resolve o ícone por `type` +
   `workflowsActionType` e a combinação não existe. Medido em centenas de
   workflows de uma conta real:
   - **leva INTERNAL:** `whatsapp_v2`, `send_whatsapp_message`,
     `update_conversation_ai_status`, `task-notification`,
     `internal_create_opportunity`, `internal_update_opportunity`,
     `workflow_ai_decision_maker`
   - **não leva:** `create_opportunity`, `sms`, `email`, `add_contact_tag`,
     `wait`, `remove_from_workflow`, `if_else`, `goto`, `transition` e o resto

   E **nunca dentro de `attributes`** — não existe lá em nenhum workflow medido.
   Antes de acrescentar o campo a um tipo novo, medir o que a conta usa nesse
   tipo de passo em vez de o pôr a toda a gente.
10. **`change-status` sem `updatedBy` dá 400** `"Invalid value updatedBy"`. O id
    vem do `user_id` das claims do token.
11. **Criar triggers não dá; editar dá.** `POST /{loc}/trigger` devolve 200 com
    um id e o trigger **não fica ligado** ao workflow (os órfãos removem-se com
    `DELETE /{loc}/trigger/{id}`). `PUT /{loc}/trigger/{id}` funciona para
    condições e `active`. Mudar o `workflow_id` no PUT não move a associação.
    Logo: para ter um trigger novo, reaproveita-se (duplica-se) um workflow que
    já tenha um, ou cria-se na UI.
12. **`copy-workflow` é para sub-contas.** Exige `subLocationId` e enfileira
    (`"Queued to copy Workflow"`); dentro da mesma location não produziu nada.
13. **A listagem mistura pastas com workflows.** As pastas dão 404 no GET da
    definição e parecem falhas de leitura. Filtrar `type === 'workflow'` ou
    pedir `?type=workflow`. As pastas vêm com `type: "directory"` (medido
    2026-10-15: sem o filtro, quase metade das primeiras 100 linhas eram pastas).
14. ⛔ **A condição `message.type` de um trigger `customer_reply` NÃO apanha um
    gateway externo — com valor nenhum.** As mensagens de um provider custom
    entram como `type: 20` (`TYPE_CUSTOM_SMS`), mas um trigger com
    `message.type == 20` **não dispara**. Provado a 2026-08-11 com a primeira
    resposta real de uma lead (`type: 20`, `delivered`): zero eventos no
    workflow. Antes disso o `20` nunca tinha sido testado por um evento real, e
    a afirmação de que funcionava sobreviveu meses na documentação por não
    haver tráfego que a contrariasse.
    **A saída é não ter condição de canal.** Usar só `workflow.id` ("Replied to
    workflow"), que é um âmbito mais apertado: só o satisfaz quem recebeu a
    mensagem daquela campanha. Os valores conhecidos — `2` = SMS nativo,
    `3` = email, `19` = WhatsApp — continuam a servir nos canais nativos; é o
    provider custom que não tem valor utilizável.
15. **A resposta vem na raiz, não embrulhada.** `GET /{loc}/{workflowId}` e
    `GET /ai-employees/employees/{id}` devolvem o objecto na raiz. Usar
    `data?.workflow ?? data` e `data?.employee ?? data?.data ?? data` —
    **nunca `?? {}`**, que devolve tudo vazio e faz parecer que o bot não tem
    prompt nenhum. Enganou duas vezes no mesmo dia.
16. **Publicar exige também `order` em cada passo.** `change-status` rejeita com
    *"'yes' action has a corrupted order"*, e os nós `if_else` de condição e os
    marcadores de ramo nascem sem `order` quando o workflow é criado por
    script. **`order` não é o índice global: é a posição dentro do ramo**,
    agrupando por `parent` — `parentKey` é outra coisa (o nó *anterior na
    cadeia*). Deduzido dos `order` que os passos já tinham e confirmado a
    publicar. No kit: `ordenarPorRamo(passos)`.
17. **`allowMultiple: false` cala um workflow para sempre, a partir da 2.ª
    vez.** Um contacto que já tenha entrado **nunca mais entra** — e
    `POST /contacts/{id}/workflow/{wfId}` (API oficial) devolve **200 na
    mesma**. Não há erro; simplesmente não corre nada. É o valor por omissão.
    Apanhado três vezes no mesmo dia (2026-08-11), incluindo um lote de 20
    inscrições reais numa campanha que devolveu 0 falhas e 0 envios. **Uma
    inscrição bem sucedida não é prova de execução:** confirmar com
    `count-per-step` — vazio significa que ninguém lá entrou, e um
    `currentStepId` repetido diz onde estão presos.
    Corolário: quem tem contactos presos num passo que entretanto se removeu
    tem de os tirar (`DELETE /contacts/{id}/workflow/{wfId}`) antes de os
    reinscrever.
18. ⛔ **O `message` de um passo `whatsapp_v2` NÃO é o que é enviado.** O passo
    tem `template_id` e `message`; o `message` é só pré-visualização. Numa
    mensagem de iniciativa o WhatsApp exige um **template aprovado pela Meta**,
    e o texto dele vive **do lado da Meta** — não no documento, não no
    `fileUrl`, não em lado nenhum do GHL. Apanhado a 2026-08-11: depois de
    mudar o nome da persona em todos os bots e workflows, com um varrimento de
    texto a dar zero ocorrências do nome antigo, a primeira lead real recebeu
    uma mensagem com o nome antigo. **Qualquer varrimento de texto no GHL tem
    este ponto cego.** Mudar a frase obriga a criar um template novo na Meta,
    com nova aprovação (24–48 h). O SMS não tem este problema: o corpo vai
    inline no passo.
19. **`window` é a janela horária do workflow**, e lê-se e escreve-se no próprio
    workflow (não nos passos):
    `{"condition":"when","start":"08:00","end":"23:00","days":[0,1,2,3,4,5,6]}`.
    Não cobre os `advancedFollowup` dos bots, que são acções e não têm
    equivalente.
    ⚠️ **`days` é o `getDay()` do JavaScript: `0` = domingo, `6` = sábado. O `7`
    NÃO existe** — e o GHL **aceita-o e grava-o sem erro**. Quem escreve
    `[1,2,3,4,5,6,7]` a pensar em segunda-a-domingo fica sem o domingo, em
    silêncio. Há também passos `wait` com `attributes.window` próprio; qual
    manda quando os dois existem não está demonstrado.
20. ⛔ **`PUT /{loc}/{id}` substitui o objecto INTEIRO: o que não for no corpo é
    apagado.** Não é merge. Um corpo `{name, status, version, workflowData}` — o
    mais natural de escrever — repõe os defaults de **todas** as outras
    definições. A API responde 200, e reler o campo que se mudou confirma que
    ficou bem; o que se perdeu só aparece dias depois, quando a campanha está
    calada ou a enviar de madrugada. As **11 chaves** a preservar:
    ```
    allowMultiple · allowMultipleOpportunity · removeContactFromLastStep · stopOnResponse
    autoMarkAsRead · timezone · eventStartDate · window · senderAddress · workflowNote · meta
    ```
    `senderAddress` e `workflowNote` passam a `null`; a chave `meta`
    **desaparece**. As restantes (`_id`, `parentId`, `fileUrl`, `createdAt`, …)
    são geridas pelo servidor e não se reenviam. No kit:
    `corpoPreservado(w, mudancas)`. A 2026-08-11 este defeito apagou o
    `allowMultiple` de campanhas **quatro vezes em oito horas**, uma delas ao
    repor a janela — corrigir metade de uma decisão destruía a outra metade.
21. **Um `limit` curto em `/workflows/logs/v2` não dá erro: dá uma conclusão
    errada.** O log traz *todos* os eventos, não só as entradas, e uma campanha
    com movimento enche 100 registos em pouco mais de uma hora. Quem cruzar
    logs com conversas para saber *por que porta entrou cada lead* atribui à
    "rota por omissão" tudo o que o limite deixou de fora — foi assim que uma
    auditoria reportou conversas atendidas pelo bot errado que na verdade
    tinham entrado pela porta certa. Pedir `limit=1000` e **avisar quando o
    registo mais antigo ainda cai dentro da janela**, que é o sinal de que
    ficou coisa por ver.

Armadilhas de conversas e canais que foram descobertas no mesmo trabalho
(áudio de entrada, media WhatsApp, DND) estão na skill `ghl-canais`.

## Schema

```jsonc
{ "workflowData": { "_id", "name", "status", "version",
                    "workflowData": { "templates": [ /* nós */ ] } },
  "triggers": [ /* recurso à parte */ ] }
```

Um nó: `{ id, order, name, type, attributes, next, parentKey, parent, cat }`

**Topologia** — é uma árvore (1 raiz, sem nós com múltiplos pais):

- `next` string → passo seguinte. `next` array → **ramifica**. Ausente → fim.
- Os filhos de um nó que ramifica são **marcadores de ramo** (`type:
  "transition"`, ou `if_else` filho), não passos reais. Cada um tem 1 `next`
  que é o corpo do ramo.
- `if_else`: `attributes.branches[]` tem **menos uma entrada** que `next[]` — a
  última é o *else* implícito.
- Nós com `attributes.transitions[]`: as listas têm o mesmo tamanho, sem else.
- `goto`: salta para `attributes.targetNodeId`.
- Expressões: `{{contact.campo}}`, `{{appointment.x}}`, `{{custom_values.x}}`.

**IDs cruzados** (`pipeline_id`, `pipeline_stage_id`, `template_id`,
`from_phone_number`) vêm por referência e não são remapeados — são decisões de
mapeamento em qualquer migração entre contas.
