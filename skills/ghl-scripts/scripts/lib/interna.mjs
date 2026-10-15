/**
 * Cliente da API interna do editor do GHL (workflows, estatisticas, bots).
 *
 * Endpoints nao documentados e sem aviso de mudanca: ritmo conservador,
 * backup antes de escrever, 1 objecto antes de centenas. Ver a skill
 * ghl-api-interna para o mapa e as armadilhas.
 */

import { Guarda } from './guarda.mjs';
import { Limitador, montarUrl, pedir } from './http.mjs';
import { utilizadorDoToken } from './sessao.mjs';

export const BASE_WORKFLOW = 'https://backend.leadconnectorhq.com/workflow';
export const BASE_ESTATISTICAS = 'https://backend.leadconnectorhq.com/workflows';
export const BASE_SERVICOS = 'https://services.leadconnectorhq.com';

/** As respostas vem na raiz, nao embrulhadas. NUNCA `?? {}`: faz parecer vazio o que nao esta. */
export const desembrulhar = {
  workflow: (d) => d?.workflow ?? d,
  bot: (d) => d?.employee ?? d?.data ?? d,
};

/**
 * @param {object} o
 * @param {string} o.token        id_token de sessao (obterTokenSessao())
 * @param {string} o.locationId
 * @param {Guarda} [o.guarda]     por omissao simula todas as escritas
 */
export function criarClienteInterno({ token, locationId, guarda = new Guarda(), limitador = new Limitador({ maximo: 40 }), esperar, fetchFn } = {}) {
  const userId = utilizadorDoToken(token);

  // O id_token do Firebase autentica em `token-id` (em Authorization: Bearer da 401).
  const headersBase = { 'token-id': token, channel: 'APP', source: 'WEB_USER' };

  async function pedido(metodo, base, caminho, { query, corpo, versao = '2021-04-15', leitura = false, location = locationId } = {}) {
    const decisao = guarda.decidir(metodo, caminho, location, { leitura });
    if (decisao === 'simular') return { simulado: true, metodo, caminho, query, corpo };
    return pedir({
      metodo,
      url: montarUrl(base + '/', caminho.replace(/^\//, ''), query),
      headers: { ...headersBase, version: versao },
      corpo,
      limitador,
      chave: location ?? '_',
      esperar,
      fetchFn,
    });
  }

  const W = (caminho = '') => `${encodeURIComponent(locationId)}${caminho}`;

  return {
    locationId,
    userId,
    pedido,

    /** Todos os workflows (sem pastas), paginando. */
    async listarWorkflows() {
      const todos = [];
      const limit = 100;
      for (let offset = 0; ; offset += limit) {
        const d = await pedido('GET', BASE_WORKFLOW, W('/list'), {
          query: { type: 'workflow', limit, offset, sortBy: 'name', sortOrder: 'asc', includeCustomObjects: true, includeObjectiveBuilder: true },
        });
        const lote = d?.rows ?? [];
        todos.push(...lote);
        if (lote.length < limit || todos.length >= (d?.count ?? 0)) break;
      }
      // a listagem mistura pastas com workflows; as pastas dao 404 no GET da definicao
      return todos.filter((r) => !r.type || r.type === 'workflow');
    },

    /**
     * Definicao completa. Workflows grandes podem trazer os passos fora do JSON,
     * no ficheiro em `fileUrl` — com `completar` (omissao) le-se de la.
     */
    async lerWorkflow(id, { completar = true, fetchFicheiro = fetchFn ?? globalThis.fetch } = {}) {
      const w = desembrulhar.workflow(await pedido('GET', BASE_WORKFLOW, W(`/${encodeURIComponent(id)}`)));
      if (completar && w?.fileUrl && !w?.workflowData?.templates) {
        const r = await fetchFicheiro(w.fileUrl);
        if (r.ok) w.workflowData = await r.json();
      }
      return w;
    },

    /** Os triggers NAO vem no GET do workflow: endpoint proprio. */
    async lerTriggers(id) {
      const d = await pedido('GET', BASE_WORKFLOW, W('/trigger'), { query: { workflowId: id } });
      return Array.isArray(d) ? d : (d?.triggers ?? []);
    },

    /**
     * PUT que nao apaga o que nao se esta a mudar (o PUT substitui o objecto
     * inteiro). `w` e o workflow tal como veio do GET.
     */
    async guardarWorkflow(w, mudancas) {
      const id = w?._id ?? w?.id;
      return pedido('PUT', BASE_WORKFLOW, W(`/${encodeURIComponent(id)}`), { corpo: corpoPreservado(w, mudancas) });
    },

    /** Republica: faz o motor passar a ler a versao gravada. */
    async republicar(id) {
      if (!userId) throw new Error('Nao consegui ler o user_id do token (necessario em updatedBy).');
      return pedido('PUT', BASE_WORKFLOW, W(`/change-status/${encodeURIComponent(id)}`), {
        corpo: { status: 'published', updatedBy: userId },
      });
    },

    /** Contactos por passo — a prova de que uma inscricao correu. */
    async contactosPorPasso(workflowId) {
      return pedido('GET', BASE_ESTATISTICAS, '/status/search/count-per-step', { query: { locationId, workflowId } });
    },

    /** Inscricoes de sempre por workflow. A resposta OMITE os workflows com zero. */
    async inscricoes(workflowIds) {
      return pedido('GET', BASE_ESTATISTICAS, '/status/search/enroll-stats', { query: { locationId, 'workflowIds[]': workflowIds } });
    },
  };
}

/**
 * As definicoes da raiz do workflow que um PUT parcial apaga em silencio.
 * Medido comparando o antes e o depois de cada escrita: `senderAddress` e
 * `workflowNote` passam a null e a chave `meta` desaparece. As que nunca se
 * viram com valor diferente do default estao aqui por precaucao.
 */
export const DEFINICOES = [
  'allowMultiple',
  'allowMultipleOpportunity',
  'removeContactFromLastStep',
  'stopOnResponse',
  'autoMarkAsRead',
  'timezone',
  'eventStartDate',
  'window',
  'senderAddress',
  'workflowNote',
  'meta',
];

/**
 * O corpo de um PUT que nao perde nada: as definicoes que vieram do GET, com
 * as mudancas por cima. So inclui chaves que existem no objecto lido — mandar
 * `undefined` num PUT nao e igual a nao mandar.
 */
export function corpoPreservado(w, mudancas = {}) {
  if (!w || typeof w !== 'object') throw new Error('corpoPreservado: workflow invalido — a leitura usou `?? {}`?');
  if (w.version === undefined) throw new Error('corpoPreservado: falta `version`; a API rejeita o PUT sem ela.');
  const corpo = { name: w.name, status: w.status, version: w.version, workflowData: w.workflowData };
  // `in` e nao `!== undefined`: um `senderAddress: null` legitimo tem de passar
  for (const k of DEFINICOES) if (k in w) corpo[k] = w[k];
  return { ...corpo, ...mudancas };
}

/** O que se perderia se este corpo fosse enviado tal como esta. */
export function perdas(w, corpo) {
  return DEFINICOES.filter((k) => {
    if (!(k in w)) return false;
    const antes = w[k];
    if (antes === null || antes === false || antes === undefined) return false; // default vazio
    return !(k in corpo);
  });
}

/**
 * `order` de cada passo = posicao DENTRO DO RAMO (agrupando por `parent`), nao
 * o indice global. Sem isto, `change-status` rejeita com "corrupted order" os
 * workflows criados por script.
 */
export function ordenarPorRamo(passos) {
  const contador = new Map();
  return passos.map((p) => {
    const ramo = p.parent ?? '__raiz__';
    const i = contador.get(ramo) ?? 0;
    contador.set(ramo, i + 1);
    return { ...p, order: i };
  });
}

/**
 * O que o motor executa: o ficheiro em `fileUrl` (responde sem autenticacao).
 * Depois de um PUT a um workflow publicado, este ficheiro fica UMA VERSAO
 * ATRAS ate se republicar — reler o documento da falso verde.
 */
export async function lerFicheiroDoMotor(w, { fetchFn = globalThis.fetch } = {}) {
  if (!w?.fileUrl) return null;
  const r = await fetchFn(w.fileUrl);
  return r.ok ? r.text() : null;
}
