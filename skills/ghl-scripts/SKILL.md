---
name: ghl-scripts
description: Kit de scripts Node (sem dependências) para operar o GoHighLevel (GHL) pela API oficial e pela API interna — verificar credenciais, procurar contactos, validar pipelines e stages, pôr/tirar tags com verificação, exportar workflows com triggers, e detectar/republicar workflows cujo motor ficou desactualizado. Usar para correr estas operações, ou antes de escrever qualquer script novo de GHL — cobre as convenções obrigatórias (simulação por omissão, guarda de location, .env, ritmo, releitura, relatório legível) e a biblioteca reutilizável.
license: MIT
compatibility: Node.js 20.12 ou mais recente, acesso à internet e credenciais GHL num .env na pasta de trabalho.
metadata:
  fonte: https://github.com/zecomando/ghl_skills
---

# Kit de scripts GHL

Scripts em **Node puro, sem dependências** (Node 20.12 ou mais recente), a
falar directamente com a API oficial e a API interna do GHL. Ficam na pasta
`scripts/` desta skill — a pasta onde está este `SKILL.md` (no Claude Code:
`${CLAUDE_SKILL_DIR}`).

## Preparar (uma vez)

Os scripts correm **a partir da pasta do projecto** e lêem o `.env` dessa
pasta (ou o ficheiro em `GHL_ENV_FILE`). O `.env` nunca vai para o Git.
Modelo comentado: [.env.example](https://github.com/zecomando/ghl_skills/blob/main/.env.example).

| Variável | Para quê | Onde se obtém |
|---|---|---|
| `GHL_LOCATION_ID` | a sub-conta em que se trabalha | URL do GHL: `/location/<ID>/` |
| `GHL_PIT_LOCATION` | API oficial (e MCP oficial) | sub-conta → Settings → Private Integrations (só os scopes necessários). Aceita também um access token OAuth |
| `GHL_WRITE_LOCATIONS` | onde a escrita é permitida (lista separada por vírgulas) | decisão tua. **Vazia = nenhuma escrita** |
| `GHL_REFRESH_TOKEN` + `GHL_FIREBASE_KEY` | API interna (workflows, bots) | capturados uma vez pela pessoa dona da conta — ver `ghl-auth-interna` |
| `GHL_RATE_PER_10S` | opcional: ritmo da API oficial (omissão 80) | — |

Primeiro comando, sempre: `node <pasta-da-skill>/scripts/ghl-verificar.mjs` —
diz o que falta e como se obtém, sem escrever nada.

## Comandos

| Comando | O que faz | Escreve? |
|---|---|---|
| `ghl-verificar.mjs` | Node, `.env`, PIT (lê a sub-conta), sessão da API interna, allowlist | não |
| `ghl-contacto.mjs --telefone=+351… \| --id=…` | contacto com o DND real por canal (completado pela pesquisa quando a leitura por id o omite) e aviso se o telefone não é E.164 | não |
| `ghl-pipelines.mjs [--stage=<id>]` | pipelines e stages; `--stage` diz o dono ou acusa **órfão** | não |
| `ghl-tag.mjs --contacto=<id> --adicionar=… \| --remover=…` | o exemplo completo de escrita segura: confere a location pelo servidor, idempotente, relê e confirma | só com `--executar` |
| `ghl-workflows-exportar.mjs [--saida=ghl-export]` | todos os workflows + triggers + `inventario.md` (os exports trazem segredos: fora do Git) | não |
| `ghl-workflow-republicar.mjs --workflow=<id> --esperado="…"` | confere o texto no **ficheiro do motor** (`fileUrl`) e republica se ficou para trás | só com `--executar` |

Todos aceitam `--json` onde faz sentido e devolvem código de saída ≠ 0 quando
algo falhou ou não se confirmou. Verificados numa conta real a 2026-10-15, só
com leituras e simulação: os seis correram sem erros (centenas de workflows
exportados, zero falhas).

## Convenções não negociáveis

1. **Simulação por omissão, `--executar` para escrever.** O modo por defeito
   mostra o que faria; escrever é um acto explícito.
2. **`.env` da pasta de trabalho**, validado no arranque: falhar cedo e
   explicar como obter o que falta — nunca rebentar a meio.
3. **Guarda de location em toda a escrita** (ver abaixo).
4. **Ritmo conservador** e repetição só onde é segura: 429 sempre; 5xx só em
   métodos repetíveis; POST nunca (salvo idempotente declarado).
5. **Um relatório legível (`inventario.md`) ao lado do output cru** — é o que
   se usa para decidir, não o JSON.
6. **Releitura depois de escrever**, sabendo onde ela mente (ver
   `ghl-seguranca-escrita`).
7. Comentários em português sem acentos (evita problemas de codificação em
   terminais Windows), a explicar o **porquê** — idealmente o incidente datado
   que justificou o código.

## A guarda de location

Um token com alcance de agência chega a todas as sub-contas, e nada na API
impede um PUT de aterrar na conta de um cliente — responde 200 na mesma.

- `Guarda` (`lib/guarda.mjs`): escrita só sai com `--executar` **e** com a
  location em `GHL_WRITE_LOCATIONS`. Sem `--executar`, simula — e avisa se a
  location não estaria autorizada.
- `garantirDaLocation(objecto, location)` entre o GET e o PUT: confere o
  `locationId` que o **servidor** devolve sobre o objecto. Um id de uma lista
  velha ou de um backup pode existir noutra sub-conta: não dá 400, dá 200 na
  conta errada.
- Scripts que trabalham várias sub-contas ("frota") recebem a location por
  argumento explícito (`--location=`) e validam-na contra uma lista declarada
  no próprio script — nunca por variável de ambiente, que é exactamente o
  vector que a guarda fecha.

## A biblioteca (para scripts novos)

```js
import { carregarEnv, exigir, argumentos, correrCli, E164 } from './lib/config.mjs';
import { guardaDoArgv, garantirDaLocation } from './lib/guarda.mjs';
import { criarClienteOficial, lerContacto, lerDnd, procurarPorTelefone, listarPipelines, dndPorCanal } from './lib/oficial.mjs';
import { obterTokenSessao } from './lib/sessao.mjs';
import { criarClienteInterno, corpoPreservado, ordenarPorRamo, lerFicheiroDoMotor } from './lib/interna.mjs';
```

| Módulo | O que resolve |
|---|---|
| `erros.mjs` | `ErroAuth` (401/403 = token) vs `ErroPedido` (outro 4xx = pedido mal formado), `EscritaBloqueada` (nada saiu) |
| `http.mjs` | ritmo por location, repetição segura, query bem codificada (o `+` dos telefones) |
| `oficial.mjs` | cliente da API oficial com a matriz do header `Version` e a guarda |
| `sessao.mjs` | token da API interna a partir do refresh token, com cache **fora** do projecto |
| `interna.mjs` | cliente da API interna; `corpoPreservado` (o PUT que não apaga as 11 definições), `ordenarPorRamo` (o `order` que a publicação exige), `lerFicheiroDoMotor` |

Exemplo mínimo de um script que escreve:

```js
await correrCli(async () => {
  carregarEnv();
  const loc = exigir('GHL_LOCATION_ID');
  const api = criarClienteOficial({ token: exigir('GHL_PIT_LOCATION'), locationId: loc, guarda: guardaDoArgv() });
  const c = garantirDaLocation(await lerContacto(api, argumentos().contacto), loc, 'contacto');
  const r = await api.post(`/contacts/${c.id}/notes`, { corpo: { body: 'texto' } });
  if (r?.simulado) return console.log('Simulado. --executar para escrever.');
  // reler e confirmar antes de dizer que ficou feito
});
```

## Checklist para um script novo

1. Cabeçalho: o que faz, como se corre, e o incidente que o justifica.
2. `carregarEnv()` + `exigir()` para cada variável (com instruções).
3. Location só por `GHL_LOCATION_ID` + guarda — ou por `--location=` validado
   contra uma lista declarada, se for de frota.
4. Simulação por omissão + `--executar`.
5. Token da API interna por `obterTokenSessao()`; nunca pedir tokens de acesso
   ao utilizador.
6. Entre GET e PUT: `garantirDaLocation()`.
7. Ritmo e repetição pelo `http.mjs` (não reinventar).
8. Output cru + relatório legível; segredos nunca no output.
9. Releitura no fim, a provar o que mudou.

Os testes do kit estão no [repositório](https://github.com/zecomando/ghl_skills) (pasta `testes/`): correr `node --test`
na raiz do repositório (não tocam em nenhuma conta GHL).

## O que scripts NÃO conseguem

- O que nem a API oficial nem a interna expõem → `ghl-computer-use`
  (Marketplace, consentimento, Meta, DNS de email, billing, SIP).
- Editar ou apagar templates Meta — a API cria, não edita nem apaga.
- Ler o estado do Conversation AI por conversa — não existe endpoint.
- Corrigir um template aprovado com o texto errado — só template novo +
  aprovação (24–48 h).
