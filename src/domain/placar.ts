import { VoteChoice } from '@prisma/client';

/**
 * Placar agregado de uma votação.
 *
 * Existe para o cliente não precisar baixar até 513 objetos de voto só para
 * contar quantos votaram SIM. A contagem é feita no banco (`groupBy`), não em
 * JavaScript sobre a lista completa.
 *
 * As chaves são os nomes do enum do Prisma (`AUSENCIA_JUSTIFICADA`,
 * `NAO_REGISTRADO`), os mesmos que o campo `voto` já devolve em toda a API.
 * No banco esses dois valores têm espaço em vez de underscore, mas expor as
 * duas grafias obrigaria o cliente a manter dois vocabulários para a mesma
 * coisa.
 */

/** Ordem canônica: posições de mérito, depois obstrução, depois ausências. */
export const VOTOS_CANONICOS: VoteChoice[] = [
  'SIM',
  'NAO',
  'ABSTENCAO',
  'OBSTRUCAO',
  'AUSENCIA_JUSTIFICADA',
  'AUSENTE',
  'NAO_REGISTRADO',
];

export type Placar = Record<VoteChoice, number>;

export function placarVazio(): Placar {
  return VOTOS_CANONICOS.reduce((acc, escolha) => {
    acc[escolha] = 0;
    return acc;
  }, {} as Placar);
}

/**
 * Todas as sete chaves sempre presentes, zeradas quando não houve o voto.
 * Chave ausente obrigaria o cliente a tratar `undefined` como zero em cada
 * leitura — e a diferença entre "ninguém votou assim" e "não sei" já não
 * existe aqui: a votação foi lida por inteiro.
 */
export function montarPlacar(
  linhas: { choice: VoteChoice; _count: { _all: number } }[],
): Placar {
  const placar = placarVazio();

  for (const linha of linhas) {
    placar[linha.choice] = linha._count._all;
  }

  return placar;
}

export function totalDoPlacar(placar: Placar): number {
  return VOTOS_CANONICOS.reduce((total, escolha) => total + placar[escolha], 0);
}
