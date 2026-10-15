/**
 * Erros com significado para quem opera o GHL.
 *
 * A regra de diagnostico que poupa tardes:
 *   401/403            -> o token esta mal (expirado, scope errado, tipo errado)
 *   tudo o resto (422) -> a autenticacao PASSOU; o pedido e que esta mal formado
 *
 * O GHL responde 422 a query params que nao conhece (`property skip should not
 * exist`) em vez de os ignorar. Tratar 422 como falha de auth manda rodar um
 * token perfeitamente bom.
 */

export class ErroGHL extends Error {
  constructor(status, mensagem, { metodo = '', url = '', corpo = '', traceId = null } = {}) {
    super(`${metodo} ${url} -> ${status}: ${mensagem}${traceId ? ` (traceId ${traceId})` : ''}`);
    this.name = new.target.name;
    this.status = status;
    this.metodo = metodo;
    this.url = url;
    this.corpo = corpo;
    this.traceId = traceId;
  }
}

/** 401/403: a credencial e o problema. Renovar, trocar o tipo ou o scope. */
export class ErroAuth extends ErroGHL {
  dica() {
    return 'O token nao serve: expirado, de tipo errado (agencia vs location, PIT vs sessao) ou sem o scope.';
  }
}

/** Outro 4xx: a autenticacao passou; o pedido e que esta mal. Nao mexer no token. */
export class ErroPedido extends ErroGHL {
  dica() {
    if (FALTA_VERSION.test(this.message)) {
      return 'Falta o header Version. O GHL responde 401 a isto, mas o token esta bom: nao mexer no token.';
    }
    return 'A autenticacao passou. O pedido esta mal formado (um 422 inclui parametros que o endpoint nao conhece). Nao mexer no token.';
  }
}

/**
 * A excepcao a regra "401 = token": sem header Version, a API oficial responde
 * 401 "version header was not found." (medido 2026-10-15 em locations, tags,
 * pipelines, calendars e contacts) — com um token perfeitamente bom.
 */
const FALTA_VERSION = /version header was not found/i;

/** 429: repete-se sozinho; so chega aqui quando as tentativas acabaram. */
export class ErroLimite extends ErroGHL {
  constructor(status, mensagem, opcoes = {}) {
    super(status, mensagem, opcoes);
    this.retryAfter = opcoes.retryAfter ?? null;
  }
  dica() {
    return 'Rate limit. O orcamento (100 pedidos/10 s por app e location) e partilhado com tudo o que toca na mesma location.';
  }
}

/** 5xx ou falha de transporte. Numa escrita nao repetivel, nao se sabe se aterrou: LER antes de repetir. */
export class ErroServidor extends ErroGHL {
  dica() {
    return 'Erro do lado do GHL ou da rede. Se era uma escrita nao repetivel (POST), confirmar por leitura se aterrou antes de repetir.';
  }
}

/** Uma escrita recusada localmente. Quando isto aparece, NADA foi enviado. */
export class EscritaBloqueada extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'EscritaBloqueada';
  }
}

/** Configuracao em falta ou invalida — com instrucoes de como a obter. */
export class ErroConfig extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroConfig';
  }
}

export function classificar(status, mensagem, opcoes = {}) {
  if (status === 401 && FALTA_VERSION.test(mensagem)) return new ErroPedido(status, mensagem, opcoes);
  if (status === 401 || status === 403) return new ErroAuth(status, mensagem, opcoes);
  if (status === 429) return new ErroLimite(status, mensagem, opcoes);
  if (status >= 500 || status === 0) return new ErroServidor(status, mensagem, opcoes);
  return new ErroPedido(status, mensagem, opcoes);
}

/** Mensagem curta e util para o terminal, com a dica quando existe. */
export function explicar(erro) {
  const dica = typeof erro?.dica === 'function' ? `\n  -> ${erro.dica()}` : '';
  return `${erro?.message ?? erro}${dica}`;
}
