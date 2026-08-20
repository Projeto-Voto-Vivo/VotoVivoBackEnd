import { InvalidParameterError } from '../errors/http-errors';

/**
 * `parlamentar.cargo` e texto livre vindo de duas APIs distintas. Um mapa
 * explicito e mais seguro que um `contains`, que casaria 'Deputado Estadual'.
 *
 * Conferir com `SELECT DISTINCT cargo FROM parlamentar` ao trocar de base.
 */
export const CARGO_POR_CASA: Record<string, string> = {
  camara: 'Deputado(a)',
  senado: 'Senador(a)',
};

export type Casa = keyof typeof CARGO_POR_CASA;

export function cargoDaCasa(casa: string): string {
  const cargo = CARGO_POR_CASA[casa.toLowerCase()];

  if (!cargo) {
    throw new InvalidParameterError('casa');
  }

  return cargo;
}
