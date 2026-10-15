# WhatsApp: media e áudio — o procedimento que funciona

Medido a 2026-08-13 com o mesmo ficheiro e o mesmo contacto. A documentação
oficial não descreve isto, e o caminho "óbvio" falha em silêncio.

## Enviar media (áudio, imagem, vídeo, documento)

⛔ **O campo `attachments` NÃO envia media em WhatsApp.** O que envia é
`whatsapp.media`, que não está documentado:

- `{type:'WhatsApp', contactId, attachments:[url]}` → **400**
  (`"Twilio Error - ERR_BAD_REQUEST"`, apesar de o canal ser Meta) **e deixa a
  mensagem presa em `pending` para sempre**, sem erro para ninguém.
- `{..., message:'texto', attachments:[url]}` → **201**, o CRM guarda o anexo,
  a mensagem fica **`read`** — e **só o texto chega ao telemóvel**
  (confirmado pelo destinatário). A releitura pela API dá falso verde: o anexo
  está lá e o estado diz `read`.

✅ **O que funciona** (extraído do frontend de conversas do GHL e provado com
`status: delivered` + `altId: wamid.*`):

```jsonc
// 1. upload — NÃO é a biblioteca de media: é /conversations/messages/upload
POST /conversations/messages/upload      multipart: conversationId + files
// ⚠️ NÃO mandar disableMaxFileSize/disableMaxFiles: com um token OAuth/PIT dá
//    400 CONVERSATIONS_MSG_UPLOAD_PARAM_CHANGE_BLOCKED. A UI manda-os; nós não.
// -> 201 {"uploadedFiles":{"nota.ogg":"https://...conversations-assets/..."}}

// 2. enviar
POST /conversations/messages
{ "locationId": "...", "contactId": "...", "type": "WhatsApp", "message": "",
  "whatsapp": { "type": "media",
                "media": { "type": "audio", "name": "nota.ogg", "url": "<o de cima>",
                           "caption": "", "mimeType": "audio/ogg" } } }
```

- `whatsapp.type` aceita **`message` · `template` · `media` · `interactive`**.
  Sem esse objecto, o `attachments` é ignorado.
- **A prova de que saiu é o `altId: wamid.*`** na mensagem devolvida — sem ele a
  mensagem não chegou à Meta, por muito que o estado diga `read`.
- Fora da janela de 24 h só saem templates, e **templates não levam áudio** (o
  cabeçalho de um template Meta aceita texto, imagem, vídeo, documento ou
  localização) — regra da Meta, não do GHL.

## Receber áudio (notas de voz)

**O áudio de entrada CHEGA à API** — a documentação do GHL diz o contrário e
está errada. Uma nota de voz de WhatsApp entra como mensagem com:

- `attachments: ["….ogg"]`, `body: ""` e `contentType: "text/plain"` (que
  mente — o anexo é `audio/ogg`);
- o ficheiro **descarrega-se sem autenticação nenhuma**, OGG/OPUS mono 48 kHz.

**A transcrição é que não vem**: o GHL transcreve para o bot e não devolve o
texto. Consequência: dá para "ouvir" áudios sem tirar o cérebro do GHL — busca-se
o `.ogg` e transcreve-se por fora (qualquer serviço de speech-to-text).

O `respondToAudio` dos bots já está a `true` por defeito e funciona (resposta
em ~30 s, só em auto-pilot). Fica por testar se um *workflow* consegue
ramificar pelo áudio; aí a documentação pode estar certa.

## Templates

- Criar: API interna `phone-system/whatsapp/location`. Editar/apagar: **não
  existe em API nenhuma**.
- O texto aprovado vive na Meta. O `message` de um passo `whatsapp_v2` é só
  pré-visualização.
- Uma sonda de schema que cria um template "de teste" deixa-o na conta para
  sempre (aprovado ou não). Não sondar criação de templates em WABAs de
  produção.
