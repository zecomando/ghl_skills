/**
 * A guarda de escrita.
 *
 * PORQUE EXISTE
 * Um token com alcance de agencia chega a todas as sub-contas, e nada na API
 * do GHL impede um PUT de aterrar na conta de um cliente — responde 200 na
 * mesma. Num repositorio real, dezenas de scripts liam
 * `process.env.GHL_LOCATION_ID || '<id>'`: uma variavel trocada reapontava
 * todos de uma vez, sem erro nenhum.
 *
 * DUAS CONDICOES PARA UMA ESCRITA SAIR
 *   1. `--executar` na linha de comando. Sem ele, SIMULA: mostra o que faria
 *      e nao envia nada.
 *   2. A location declarada esta em GHL_WRITE_LOCATIONS. Lista vazia = nada
 *      passa — e o comportamento certo por omissao.
 *
 * E UM TERCEIRO VECTOR, MENOS OBVIO
 * Um id de objecto (bot, workflow, contacto) vindo de uma lista velha ou de
 * um backup pode existir noutra sub-conta. A variavel esta certa e a escrita
 * aterra no sitio errado. `garantirDaLocation()` confere o que o SERVIDOR diz
 * do objecto, entre o GET e o PUT.
 *
 * O QUE NAO FAZ: travar leituras. Exportar e auditar sao trabalho legitimo.
 */

import { EscritaBloqueada } from './erros.mjs';

const LEITURAS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** GHL_WRITE_LOCATIONS -> Set. */
export function locationsPermitidas(valor = process.env.GHL_WRITE_LOCATIONS || '') {
  return new Set(
    String(valor)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export class Guarda {
  constructor({ executar = false, permitidas = locationsPermitidas(), registar = console.log } = {}) {
    this.executar = executar;
    this.permitidas = permitidas instanceof Set ? permitidas : new Set(permitidas);
    this.registar = registar;
  }

  /**
   * Decide o destino de um pedido: 'enviar' ou 'simular'.
   * Lanca EscritaBloqueada quando a escrita nunca pode sair.
   * `leitura: true` serve para os POST que sao leituras (ex.: POST /contacts/search).
   */
  decidir(metodo, descricao, locationId, { leitura = false } = {}) {
    const verbo = String(metodo).toUpperCase();
    if (leitura || LEITURAS.has(verbo)) return 'enviar';

    if (!locationId) {
      throw new EscritaBloqueada(`${verbo} ${descricao} recusado: uma escrita tem de declarar a location. Nada foi enviado.`);
    }
    const autorizada = this.permitidas.has(locationId);

    if (!this.executar) {
      this.registar(
        `SIMULACAO  ${verbo} ${descricao}  [location ${locationId}]` +
          (autorizada ? '' : '\n  ATENCAO: esta location nao esta em GHL_WRITE_LOCATIONS — com --executar seria recusada.'),
      );
      return 'simular';
    }

    if (!autorizada) {
      throw new EscritaBloqueada(
        `${verbo} ${descricao} recusado: a location ${locationId} nao esta em GHL_WRITE_LOCATIONS ` +
          `(${[...this.permitidas].join(', ') || 'lista vazia'}). Nada foi enviado.\n` +
          'Um token com alcance de agencia chega a todas as sub-contas, e a API responderia 200 na conta errada.',
      );
    }
    return 'enviar';
  }
}

/** A guarda a partir da linha de comando: escreve so com --executar. */
export function guardaDoArgv(argv = process.argv) {
  return new Guarda({ executar: argv.includes('--executar') });
}

/**
 * Confere, contra o que o servidor devolveu, que o objecto e da location
 * esperada. Chamar SEMPRE entre o GET e o PUT/DELETE — o GET ja foi feito,
 * portanto nao custa uma chamada a mais.
 */
export function garantirDaLocation(objecto, locationEsperada, descricao = 'objecto') {
  const doServidor = objecto?.locationId ?? objecto?.location_id;
  if (!doServidor) {
    throw new EscritaBloqueada(
      `O ${descricao} veio sem locationId: nao da para provar de que conta e, e nao se escreve as cegas.\n` +
        'Se a leitura usou `?? {}`, e isso — desembrulhar com `data?.workflow ?? data` (nunca `?? {}`).',
    );
  }
  if (doServidor !== locationEsperada) {
    throw new EscritaBloqueada(
      `O ${descricao} e da location ${doServidor}, nao da ${locationEsperada}. ABORTADO antes de escrever — ` +
        'provavelmente um id de uma lista velha, de um backup ou de outra sub-conta.',
    );
  }
  return objecto;
}
