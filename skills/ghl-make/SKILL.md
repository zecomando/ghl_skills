---
name: ghl-make
description: O Make (make.com) como orquestrador das automações GoHighLevel (GHL) — API v2 do Make (exportar blueprints, provisionar cenários, keychains, webhooks), a disciplina fail-closed ao importar blueprints, e um padrão de arquitectura de campanha (elegibilidade, decisão, execução, inbound) com idempotência. Usar para qualquer cenário Make novo ou alteração a um existente que fale com o GHL; os mesmos princípios valem para n8n, Zapier ou outro orquestrador.
license: MIT
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# Make — o orquestrador

O Make não é mais um caminho de acesso ao GHL: é quem decide **quando** chamar
os outros (API oficial, app própria, webhooks). Os princípios abaixo valem para
qualquer orquestrador (n8n, Zapier, os próprios workflows do GHL).

## API do Make v2

- Base: `https://{zona}/api/v2` — a zona é a da tua conta (ex.: `eu1.make.com`,
  `eu2.make.com`, `us1.make.com`; vê-se no URL quando entras no Make).
- Autenticação: `Authorization: Token <MAKE_API_TOKEN>` (Perfil → API access →
  Add token; dar só os scopes necessários).
- Recursos organizam-se por organização e equipa (`organizationId`, `teamId`);
  descobrem-se pela própria API quando não estão configurados.
- Referência: <https://developers.make.com/api-documentation>.
- Os mesmos bons hábitos que no GHL: ritmo entre chamadas, retry exponencial
  em 429, abortar com mensagem clara depois de N tentativas.
- **Antes de qualquer mudança, exportar** todos os cenários + blueprints crus e
  gerar um inventário legível (nome, estado, última execução, consumo). É o
  snapshot para comparar e, se preciso, repor.

## Blueprints: importar é fail-closed

Um blueprint importado não corre até estar ligado — e isso é uma feature:

- **Conexões não viajam no blueprint.** Cada módulo GHL/HTTP/Data Store tem de
  ser religado à conexão certa na conta de destino. Um cenário que corre com a
  conexão errada escreve na location errada sem erro nenhum.
- **IDs não viajam.** `locationId`, `pipelineId`, `stageId`, `calendarId`,
  `agentId`, `dataStoreId`, `webhookId` são por ambiente/conta — num blueprint
  ficam placeholders para resolver à mão.
- **Segredos não viajam — e não devem.** Nunca meter tokens em
  headers/corpos de módulos nem em variáveis do cenário: os blueprints
  exportam-se e versionam-se. Autenticação de webhooks → **keychain** do Make.
- **Activar é o último passo**, depois de: conexões ligadas, IDs resolvidos, um
  run manual verde, e leitura do output (não só "correu" — o que escreveu, e
  onde).

## Padrão de arquitectura de campanha

Medido numa campanha multicanal real (SMS + voz):

1. **Elegibilidade** — cenário que decide *quem* entra: DND por canal
   (`dndSettings`), tags de opt-out, telefone E.164 válido, nome seguro.
   Erros aqui não podem ser engolidos: num caso real, o cenário engoliu o 400
   do `POST /contacts/` e cerca de 40% das linhas ficaram presas como
   "processadas" sem o terem sido.
2. **Decisão / janela** — *quando* e *por que canal*: janelas horárias, ritmo,
   quotas Meta, reentrada na campanha.
3. **Execução** — SMS directo, ou ordem a um serviço próprio (ex.: chamada de
   voz) com `idempotencyKey` estável — ver `ghl-app-marketplace`.
4. **Inbound** — cenários de resposta (SMS recebido, opt-out) com webhooks
   autenticados pelo keychain.

Regras transversais:

- `saveResponse: true` nas acções que chamam um serviço externo — sem ele o
  passo seguinte não vê o resultado.
- Falhas de criação de contacto **propagam** (ou marcam a linha), nunca
  continuam o cenário em silêncio. Usar `POST /contacts/upsert`, não
  `POST /contacts/` (ver `ghl-api-oficial`).
- Idempotência do lado de quem executa: re-correr um cenário não pode duplicar
  chamadas/SMS — a `idempotencyKey` estável por (campanha, contacto) resolve.
- Data stores guardam o estado da campanha; o cenário não assume ordem nem
  entrega única de webhooks (o GHL repete até 12×).
- O rate limit do GHL (100 pedidos/10 s por app e location) é **partilhado**
  com tudo o que toca na mesma location — vários cenários activos somam-se.

## Limites do orquestrador

- O Make **orquestra**, não substitui a guarda: um cenário a escrever no GHL
  sem validar location/stage/slot herda todos os falsos verdes documentados em
  `ghl-seguranca-escrita`.
- Cenário com erro engolido é pior do que cenário parado — a linha fica
  "processada" sem ter sido. Fail-loud, sempre.
- Não há "diff" de blueprint seguro: antes de reimportar, exportar o actual e
  comparar à mão o que muda.
