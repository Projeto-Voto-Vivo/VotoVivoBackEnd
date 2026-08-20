/**
 * Regras puras de classificacao de presenca. Sem Prisma de proposito: sao o
 * nucleo das correcoes da Fase 2 e precisam ser testaveis sem mock de banco.
 */

/** NFD + remocao de acentos + minusculas + colapso de espacos. */
export const normalizar = (valor?: string | null): string =>
  (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export type Natureza = 'DELIBERATIVA' | 'NAO_DELIBERATIVA' | 'INDEFINIDA';
export type Escopo = 'PLENARIO' | 'COMISSAO' | 'INDEFINIDO';

/**
 * Lista EXPLICITA, comparada por igualdade.
 *
 * O codigo antigo usava `descricaoTipo.includes('deliberativa')`, que
 * classificava "Sessao NAO Deliberativa Solene" como deliberativa, e caia em
 * deliberativa por default quando `descricaoTipo` era nulo.
 *
 * Valores que o ETL grava hoje: 'Sessao Deliberativa' (plenario da Camara e
 * sessoes do Senado), 'Sessao Conjunta' (Congresso) e, para comissoes, o texto
 * cru raspado do site da Camara — dai as variantes de "reuniao".
 */
const DELIBERATIVAS = new Set([
  'sessao deliberativa',
  'sessao deliberativa ordinaria',
  'sessao deliberativa extraordinaria',
  'sessao conjunta',
  'reuniao deliberativa',
  'reuniao deliberativa ordinaria',
  'reuniao deliberativa extraordinaria',
]);

const NAO_DELIBERATIVAS = new Set([
  'sessao nao deliberativa',
  'sessao nao deliberativa solene',
  'sessao solene',
  'sessao de debates',
  'audiencia publica',
  'reuniao tecnica',
  'reuniao de instalacao e eleicao',
  'seminario',
  'mesa redonda',
]);

const TIPOS_PLENARIO = new Set(['plenario']);
const SIGLAS_PLENARIO = new Set(['plen', 'plen-sf', 'cn', 'pleno']);

/**
 * Descricao nula ou fora das listas vira INDEFINIDA — sai de todas as taxas e
 * e contabilizada em `excluidos`. Falha segura: nunca mais default deliberativo.
 */
export function classificarNatureza(descricaoTipo?: string | null): Natureza {
  const descricao = normalizar(descricaoTipo);

  if (!descricao) return 'INDEFINIDA';
  if (DELIBERATIVAS.has(descricao)) return 'DELIBERATIVA';
  if (NAO_DELIBERATIVAS.has(descricao)) return 'NAO_DELIBERATIVA';

  return 'INDEFINIDA';
}

/**
 * Plenario e comissao sao taxas distintas; somar as duas produz um numero sem
 * significado. Evento sem orgao vinculado (o ETL de comissoes grava NULL quando
 * nao resolve o orgao) nunca entra no balde de plenario.
 */
export function classificarEscopo(
  orgao?: { tipoOrgao?: string | null; sigla?: string | null } | null,
): Escopo {
  if (!orgao) return 'INDEFINIDO';

  const tipo = normalizar(orgao.tipoOrgao);

  if (TIPOS_PLENARIO.has(tipo)) return 'PLENARIO';
  if (SIGLAS_PLENARIO.has(normalizar(orgao.sigla))) return 'PLENARIO';

  return tipo ? 'COMISSAO' : 'INDEFINIDO';
}

export type Periodo = { inicio: Date; fim: Date | null };

/**
 * Restringe o denominador ao exercicio do mandato: sem isso, quem assumiu no
 * meio do mandato e punido por ausencias anteriores a posse.
 */
export function dentroDoExercicio(data: Date | null | undefined, periodos: Periodo[]): boolean {
  if (!data) return false;
  if (periodos.length === 0) return true; // sem dados de mandato, nao filtra (ver metodologia)

  return periodos.some(
    (periodo) => periodo.inicio <= data && (!periodo.fim || data <= fimDoDia(periodo.fim)),
  );
}

/**
 * `dataFim` e uma coluna DATE: o Prisma a devolve como meia-noite UTC. Comparar
 * contra um DATETIME de evento exige esticar ate o fim do mesmo dia — em UTC,
 * senao o fuso local do servidor corta algumas horas do ultimo dia de mandato.
 */
export function fimDoDia(data: Date): Date {
  const fim = new Date(data);
  fim.setUTCHours(23, 59, 59, 999);
  return fim;
}

export type Balde = {
  total: number;
  presentes: number;
  justificadas: number;
  faltas: number;
};

export const baldeVazio = (): Balde => ({ total: 0, presentes: 0, justificadas: 0, faltas: 0 });

export function acumular(balde: Balde, status: 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADA'): void {
  balde.total += 1;
  if (status === 'PRESENTE') balde.presentes += 1;
  else if (status === 'JUSTIFICADA') balde.justificadas += 1;
  else balde.faltas += 1;
}

const arredondar = (valor: number) => Number(valor.toFixed(1));

/**
 * Duas leituras da mesma contagem, porque a escolha e editorial e cabe a UI:
 * `taxa` trata falta justificada como cumprimento do dever; `taxaEstrita` nao.
 *
 * `null` quando nao ha eventos — nunca 0%. O front precisa distinguir
 * "sem dados" de "nao compareceu".
 */
export function resumirBalde(balde: Balde) {
  return {
    taxa: balde.total === 0 ? null : arredondar(((balde.presentes + balde.justificadas) / balde.total) * 100),
    taxaEstrita: balde.total === 0 ? null : arredondar((balde.presentes / balde.total) * 100),
    total: balde.total,
    presentes: balde.presentes,
    justificadas: balde.justificadas,
    faltas: balde.faltas,
  };
}
