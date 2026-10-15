/**
 * Cliente da API oficial do GHL (services.leadconnectorhq.com).
 *
 * Numa implementacao so: matriz do header Version, ritmo por location,
 * repeticao segura (POST nao se repete), guarda de escrita e a classificacao
 * de erros (401/403 = token; resto = pedido). `locationId` e obrigatorio em
 * toda a escrita — sem ele e recusada antes de sair um byte.
 */

import { ErroConfig } from './erros.mjs';
import { Guarda } from './guarda.mjs';
import { Limitador, montarUrl, pedir } from './http.mjs';

export const BASE_OFICIAL = 'https://services.leadconnectorhq.com';

export const VERSAO = {
  PADRAO: '2021-07-28',
  V3: 'v3',
  CALENDARIO: '2021-04-15',
};

const POR_PREFIXO = [
  ['/contacts', VERSAO.V3],
  ['/conversations', VERSAO.V3],
  ['/calendars', VERSAO.PADRAO],
  ['/opportunities', VERSAO.PADRAO],
  ['/locations', VERSAO.PADRAO],
  ['/users', VERSAO.PADRAO],
  ['/workflows', VERSAO.PADRAO],
  ['/oauth', VERSAO.PADRAO],
];

/**
 * O header Version NAO e uniforme, e o errado nao da erro: da 200 com um corpo
 * de forma diferente. Matriz medida em producao (o `v3` surgiu a 2026-06-11):
 *   2021-04-15  free-slots e listagem /calendars/events
 *   v3          contactos (CRUD), /calendars/events/appointments, conversas
 *   2021-07-28  o resto: oportunidades, tags e campos da location, inscricao
 *               em workflow, locations, users
 * Omitido tem comportamento nao documentado — envia-se sempre um. Na duvida,
 * forcar com { versao } e comparar a forma da resposta.
 */
export function versaoPara(caminho) {
  const p = String(caminho).split('?')[0];
  if (p.includes('/free-slots')) return VERSAO.CALENDARIO;
  if (p.startsWith('/calendars/events/appointments')) return VERSAO.V3;
  if (p.startsWith('/calendars/events')) return VERSAO.CALENDARIO;
  if (/^\/contacts\/[^/]+\/workflow\//.test(p)) return VERSAO.PADRAO; // inscricao em workflow
  for (const [prefixo, versao] of POR_PREFIXO) if (p.startsWith(prefixo)) return versao;
  return VERSAO.PADRAO;
}

/**
 * @param {object} o
 * @param {string} o.token        PIT da sub-conta ou access token OAuth
 * @param {string} o.locationId   a location em que se trabalha
 * @param {Guarda} [o.guarda]     por omissao simula todas as escritas
 */
export function criarClienteOficial({
  token,
  locationId,
  guarda = new Guarda(),
  limitador = new Limitador(),
  esperar,
  fetchFn,
  base = BASE_OFICIAL,
} = {}) {
  if (!token) throw new ErroConfig('criarClienteOficial: falta o token (GHL_PIT_LOCATION).');

  async function pedido(metodo, caminho, { query, corpo, versao, idempotente = false, leitura = false, location = locationId } = {}) {
    const decisao = guarda.decidir(metodo, caminho, location, { leitura });
    if (decisao === 'simular') return { simulado: true, metodo, caminho, query, corpo };
    return pedir({
      metodo,
      url: montarUrl(base, caminho, query),
      headers: { Authorization: `Bearer ${token}`, Version: versao ?? versaoPara(caminho) },
      corpo,
      idempotente,
      limitador,
      chave: location ?? '_',
      esperar,
      fetchFn,
    });
  }

  return {
    locationId,
    pedido,
    get: (caminho, opcoes) => pedido('GET', caminho, opcoes),
    post: (caminho, opcoes) => pedido('POST', caminho, opcoes),
    put: (caminho, opcoes) => pedido('PUT', caminho, opcoes),
    patch: (caminho, opcoes) => pedido('PATCH', caminho, opcoes),
    delete: (caminho, opcoes) => pedido('DELETE', caminho, opcoes),
  };
}

// ------------------------------------------------------------ ajudas de leitura
// Cada uma codifica uma armadilha medida. Ver a skill ghl-api-oficial.

/**
 * Contacto por id. O endpoint ignora um `?locationId=` (medido 2026-10-15:
 * devolve o contacto mesmo com outra location no parametro), por isso filtra-se
 * a resposta: um contacto de outra sub-conta nao pode parecer nosso.
 *
 * A leitura por id OMITE `dnd` e `dndSettings` quando nunca foram definidos
 * (medido 2026-10-15, em v3, 2023-02-21, 2021-07-28 e 2021-04-15; com DND
 * activo os campos vem). Sem eles nao se distingue "sem DND" de
 * "desconhecido": com `comDnd` (omissao), o estado vem da pesquisa (`lerDnd`).
 * Se a pesquisa falhar, o contacto fica desconhecido — e desconhecido bloqueia.
 */
export async function lerContacto(cliente, id, { comDnd = true } = {}) {
  const dados = await cliente.get(`/contacts/${encodeURIComponent(id)}`);
  const contacto = dados?.contact ?? dados;
  if (contacto?.locationId && contacto.locationId !== cliente.locationId) {
    throw new Error(`O contacto ${id} e da location ${contacto.locationId}, nao da ${cliente.locationId}. Ignorado.`);
  }
  if (comDnd && contacto && !('dnd' in contacto) && !('dndSettings' in contacto)) {
    try {
      const dnd = await lerDnd(cliente, id);
      if (dnd) Object.assign(contacto, dnd);
    } catch {
      // a pesquisa falhou: fica desconhecido, que bloqueia — nunca "sem DND"
    }
  }
  return contacto;
}

/**
 * O estado de DND de um contacto, pela pesquisa — o unico caminho medido que o
 * devolve para um contacto concreto (2026-10-15). `POST /contacts/search` e uma
 * LEITURA apesar do metodo. Devolve { dnd, dndSettings } so com os campos que
 * vieram, ou null se a pesquisa nao encontrou o contacto.
 */
export async function lerDnd(cliente, id) {
  const dados = await cliente.post('/contacts/search', {
    leitura: true,
    versao: VERSAO.PADRAO,
    corpo: { locationId: cliente.locationId, page: 1, pageLimit: 1, filters: [{ field: 'id', operator: 'eq', value: id }] },
  });
  const c = (dados?.contacts ?? []).find((x) => x?.id === id);
  if (!c) return null;
  const dnd = {};
  if ('dnd' in c) dnd.dnd = c.dnd;
  if ('dndSettings' in c) dnd.dndSettings = c.dndSettings;
  return dnd;
}

/**
 * Contacto por telefone (lookup canonico). Devolve um contacto "slim" — sem
 * dnd/dndSettings — por isso rele-se (por id + pesquisa) quando encontra.
 */
export async function procurarPorTelefone(cliente, telefone) {
  const dados = await cliente.get('/contacts/search/duplicate', {
    query: { locationId: cliente.locationId, number: telefone },
  });
  const slim = dados?.contact ?? null;
  return slim?.id ? lerContacto(cliente, slim.id) : null;
}

/** Pipelines e stages da location — para validar stage ids antes de escrever. */
export async function listarPipelines(cliente) {
  const dados = await cliente.get('/opportunities/pipelines', { query: { locationId: cliente.locationId } });
  return dados?.pipelines ?? [];
}

/** Estado de DND por canal. O booleano `dnd` reverte-se sozinho e nao prova nada. */
export function dndPorCanal(contacto) {
  if (!contacto || (!('dnd' in contacto) && !('dndSettings' in contacto))) {
    return { desconhecido: true }; // desconhecido BLOQUEIA o envio
  }
  const canais = {};
  for (const [canal, v] of Object.entries(contacto.dndSettings ?? {})) canais[canal] = v?.status === 'active';
  return { desconhecido: false, dndBooleano: Boolean(contacto.dnd), canais };
}
