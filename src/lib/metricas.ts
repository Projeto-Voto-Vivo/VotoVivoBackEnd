import { InvalidParameterError } from '../errors/http-errors';

/**
 * Whitelist da coluna monetaria.
 *
 * Duas razoes para existir:
 *  1. Nunca interpolar entrada do usuario em SQL — so um destes literais chega
 *     ao `Prisma.raw`.
 *  2. `empenhado`, `liquidado` e `pago` sao valores diferentes do ciclo
 *     orcamentario. Todo endpoint monetario declara qual usou, senao o numero
 *     nao significa nada.
 */
export const COLUNA_METRICA = {
  empenhado: 'valorEmpenhado',
  liquidado: 'valorLiquidado',
  pago: 'valorPago',
} as const;

/** Mesmo conceito, no nome do campo do Prisma. */
export const CAMPO_METRICA = {
  empenhado: 'committedAmount',
  liquidado: 'liquidatedAmount',
  pago: 'paidAmount',
} as const;

export type Metrica = keyof typeof COLUNA_METRICA;

export const METRICA_PADRAO: Metrica = 'empenhado';

export function parseMetrica(valor: unknown): Metrica {
  if (valor === undefined || valor === null || valor === '') {
    return METRICA_PADRAO;
  }

  if (typeof valor === 'string' && valor in COLUNA_METRICA) {
    return valor as Metrica;
  }

  throw new InvalidParameterError('metrica');
}

/**
 * `COUNT(*)` volta como BigInt e `SUM(DECIMAL)` como string/Decimal no driver
 * MariaDB. `JSON.stringify(BigInt)` lanca TypeError — toda linha crua tem de
 * passar por aqui antes de virar resposta.
 */
export function toNumber(valor: unknown): number {
  if (valor === null || valor === undefined) {
    return 0;
  }

  return Number(valor);
}
