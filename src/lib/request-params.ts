import { InvalidParameterError } from '../errors/http-errors';

/** Tamanho de pagina padrao das listagens. */
export const TAMANHO_PAGINA_PADRAO = 20;

/** Teto de itens por pagina: impede que `?limite=100000` varra a tabela. */
export const TAMANHO_PAGINA_MAX = 100;

export type Pagination = { page: number; limit: number };

/**
 * Converte um parametro de rota/query em inteiro positivo.
 * `Number('abc')` e `NaN` — sem esta validacao o `NaN` chega ao Prisma e vira 500.
 */
export function parsePositiveInt(value: unknown, field: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidParameterError(field);
  }

  return parsed;
}

export function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function getOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Lê `pagina` e `limite` da query, com defaults e teto. Invalidos viram 400. */
export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = query.pagina === undefined ? 1 : parsePositiveInt(query.pagina, 'pagina');
  const requested =
    query.limite === undefined
      ? TAMANHO_PAGINA_PADRAO
      : parsePositiveInt(query.limite, 'limite');

  return { page, limit: Math.min(requested, TAMANHO_PAGINA_MAX) };
}

export function buildMeta(total: number, page: number, limit: number) {
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return {
    total,
    page,
    lastPage,
    limit,
    temProximaPagina: page < lastPage,
  };
}

/**
 * Meta de uma pagina que nao contou o total.
 *
 * `COUNT(*)` com os mesmos filtros da listagem e uma segunda varredura completa
 * da tabela — com `?busca=`, dobra o custo da requisicao mais cara da API. Um
 * cliente de rolagem infinita nao precisa de `lastPage`, so precisa saber se ha
 * mais alguma coisa; `temProximaPagina` sai de buscar uma linha a mais, o que
 * custa praticamente nada.
 */
export function buildMetaSemContagem(
  page: number,
  limit: number,
  temProximaPagina: boolean,
) {
  return {
    total: null,
    page,
    lastPage: null,
    limit,
    temProximaPagina,
  };
}

/** `?contarTotal=false` desliga a contagem. Qualquer outro valor mantem. */
export function parseContarTotal(valor: unknown): boolean {
  return valor !== 'false';
}
