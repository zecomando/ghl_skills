// Ajudas partilhadas pelos testes: um fetch falso e um JWT de brincar.
// Nenhum teste toca na rede nem numa conta GHL real.

/** fetch falso que devolve as respostas pela ordem e regista as chamadas. */
export function fetchFalso(respostas) {
  const fila = [...respostas];
  const chamadas = [];
  const fn = async (url, opcoes = {}) => {
    chamadas.push({ url: String(url), ...opcoes });
    if (!fila.length) throw new Error(`fetch inesperado: ${url}`);
    const r = fila.shift();
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r(url, opcoes) : r;
  };
  fn.chamadas = chamadas;
  return fn;
}

export const resposta = (status, corpo, headers = {}) =>
  new Response(corpo === undefined ? '' : typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers });

export const semEspera = async () => {};
export const silencio = () => {};

/** JWT nao assinado, so para ler claims. */
export const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'assinatura'].join('.');

/** Corre fn com variaveis de ambiente temporarias, repondo o estado no fim. */
export async function comAmbiente(vars, fn) {
  const antes = {};
  for (const k of Object.keys(vars)) {
    antes[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
