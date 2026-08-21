import { Prisma } from '@prisma/client';
import { normalizar } from './presence';

/**
 * Sobre O QUE se votou.
 *
 * `votacao.resumoMateria` guarda o campo `descricao` da API da Camara, que e
 * formulaico — vem do sistema da Casa, nao de digitacao livre. Isso permite
 * classificar por lista explicita, a mesma tecnica de `classificarNatureza`.
 *
 * POR QUE ISTO IMPORTA
 *
 * SIM e NAO nao tem significado estavel sem saber o objeto. A mesma votacao
 * pode ser sobre o texto principal (SIM aprova a materia), sobre um destaque
 * supressivo (NAO e que preserva o texto), sobre um requerimento de urgencia
 * (o voto e sobre o rito) ou sobre a redacao final (quase sempre unanime, ruido
 * em qualquer estatistica). Sem esta classificacao, "os temas em que mais vota
 * a favor" e um rotulo que o dado nao sustenta.
 *
 * POR QUE SUBSTRING, E NAO REGEX
 *
 * A mesma regra precisa valer em dois lugares: no TypeScript, para exibir, e em
 * SQL, para filtrar a agregacao por tema. Substring tem semantica identica nos
 * dois (`incluir` em JS, `LIKE '%x%'` em SQL) porque as tabelas usam
 * `utf8mb4_unicode_ci`, insensivel a caixa E a acento. Regex traria fronteira
 * de palavra, mas as duas implementacoes divergiriam com o tempo — e uma regra
 * de classificacao que difere entre exibir e filtrar e pior que uma regra menos
 * precisa.
 *
 * Medido em 2.500 votacoes reais: 0,8% de INDEFINIDO.
 */

export type ObjetoVotacao =
  | 'TEXTO_BASE'
  | 'PARECER'
  | 'EMENDA'
  | 'DESTAQUE'
  | 'REQUERIMENTO'
  | 'REDACAO_FINAL'
  | 'ENCAMINHAMENTO'
  | 'INDEFINIDO';

export const OBJETOS_VOTACAO: ObjetoVotacao[] = [
  'TEXTO_BASE',
  'PARECER',
  'EMENDA',
  'DESTAQUE',
  'REQUERIMENTO',
  'REDACAO_FINAL',
  'ENCAMINHAMENTO',
  'INDEFINIDO',
];

/**
 * Votos com posicao de merito — onde SIM significa apoio ao que se votou.
 *
 * Requerimento e rito, redacao final e formalidade quase unanime, e
 * encaminhamento e despacho administrativo: nenhum diz o que o parlamentar
 * pensa da materia. Na amostra real, merito e ~54% das votacoes; so
 * `TEXTO_BASE` seria 2,8%, pequeno demais para sustentar uma analise.
 */
export const OBJETOS_DE_MERITO: ObjetoVotacao[] = [
  'TEXTO_BASE',
  'PARECER',
  'EMENDA',
  'DESTAQUE',
];

export const ehMerito = (objeto: ObjetoVotacao): boolean =>
  OBJETOS_DE_MERITO.includes(objeto);

type Regra = { objeto: ObjetoVotacao; padroes: string[] };

/**
 * A ORDEM decide: a primeira regra que casa vence.
 *
 * Duas armadilhas que a ordem resolve, e que substring criaria em silencio:
 *
 *  - "Proposta de Emenda a Constituicao" contem "emenda", mas uma PEC e texto
 *    base. Por isso ela aparece ANTES da regra de EMENDA.
 *  - "Emendas ao Substitutivo" contem "substitutivo", mas o objeto votado sao
 *    as emendas. Por isso EMENDA vem antes do resto de TEXTO_BASE.
 *
 * `TEXTO_BASE` aparece duas vezes de proposito: a entrada especifica precede
 * EMENDA, a generica vem depois.
 */
const REGRAS: Regra[] = [
  { objeto: 'REDACAO_FINAL', padroes: ['redacao final'] },
  {
    objeto: 'ENCAMINHAMENTO',
    padroes: ['encaminhamento', 'alteracao do regime de tramitacao'],
  },
  { objeto: 'TEXTO_BASE', padroes: ['proposta de emenda a constituicao'] },
  { objeto: 'DESTAQUE', padroes: ['destaque'] },
  { objeto: 'EMENDA', padroes: ['emenda'] },
  { objeto: 'REQUERIMENTO', padroes: ['requerimento', 'preferencia'] },
  { objeto: 'PARECER', padroes: ['parecer', 'relatorio'] },
  {
    objeto: 'TEXTO_BASE',
    padroes: [
      'projeto de lei',
      'substitutivo',
      'medida provisoria',
      'projeto de decreto',
      'projeto de resolucao',
      'mantido o texto',
      'materia',
    ],
  },
];

export function classificarObjeto(resumo?: string | null): ObjetoVotacao {
  const texto = normalizar(resumo);

  if (!texto) {
    return 'INDEFINIDO';
  }

  for (const regra of REGRAS) {
    if (regra.padroes.some((padrao) => texto.includes(padrao))) {
      return regra.objeto;
    }
  }

  return 'INDEFINIDO';
}

/** `coluna LIKE '%padrao%'` — a collation cuida de caixa e acento. */
const casa = (coluna: Prisma.Sql, padrao: string) =>
  Prisma.sql`${coluna} LIKE ${`%${padrao}%`}`;

const casaAlgum = (coluna: Prisma.Sql, padroes: string[]) =>
  Prisma.join(
    padroes.map((padrao) => casa(coluna, padrao)),
    ' OR ',
  );

/**
 * Traduz a MESMA lista de regras para SQL, preservando o "primeira que casa
 * vence": uma categoria so se aplica se nenhuma regra anterior tiver casado.
 *
 * Gerado a partir de `REGRAS` de proposito — escrever o SQL a mao criaria duas
 * definicoes da mesma regra, que divergem na primeira manutencao.
 */
export function filtroObjetoSql(
  coluna: Prisma.Sql,
  objeto: ObjetoVotacao,
): Prisma.Sql {
  const todosPadroes = REGRAS.flatMap((regra) => regra.padroes);

  if (objeto === 'INDEFINIDO') {
    return Prisma.sql`(${coluna} IS NULL OR NOT (${casaAlgum(coluna, todosPadroes)}))`;
  }

  const alternativas: Prisma.Sql[] = [];

  REGRAS.forEach((regra, indice) => {
    if (regra.objeto !== objeto) {
      return;
    }

    const anteriores = REGRAS.slice(0, indice).flatMap((r) => r.padroes);
    const naoCasouAntes = anteriores.length
      ? Prisma.sql` AND NOT (${casaAlgum(coluna, anteriores)})`
      : Prisma.empty;

    alternativas.push(Prisma.sql`((${casaAlgum(coluna, regra.padroes)})${naoCasouAntes})`);
  });

  return Prisma.sql`(${Prisma.join(alternativas, ' OR ')})`;
}

/** Disjunção das categorias de mérito. */
export function filtroMeritoSql(coluna: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(${Prisma.join(
    OBJETOS_DE_MERITO.map((objeto) => filtroObjetoSql(coluna, objeto)),
    ' OR ',
  )})`;
}

/**
 * A MESMA lista de regras, agora como `where` do Prisma.
 *
 * Existe uma terceira traducao porque `GET /parlamentares/:id/votacoes` usa
 * `findMany`, e paginacao so e correta se o recorte acontecer no banco:
 * filtrar a pagina ja lida devolveria 20 linhas das quais 8 sobrevivem, e o
 * `total` do `meta` mentiria.
 *
 * Gerada a partir de `REGRAS`, como a versao SQL, para nao haver uma segunda
 * definicao da regra. `npm run verifica:objeto` prova as tres equivalentes
 * contra um MySQL real — TypeScript, SQL cru e este `where`.
 *
 * Sobre `resumoMateria` nulo: para uma categoria concreta a linha sai (em SQL,
 * `NOT (NULL LIKE ...)` e NULL, que nao passa no WHERE), e so `INDEFINIDO` a
 * traz de volta com o ramo explicito de nulo — identico a `filtroObjetoSql`.
 */
const casaAlgumWhere = (padroes: string[]): Prisma.VotingWhereInput => ({
  OR: padroes.map((padrao) => ({ subjectSummary: { contains: padrao } })),
});

export function filtroObjetoWhere(objeto: ObjetoVotacao): Prisma.VotingWhereInput {
  const todosPadroes = REGRAS.flatMap((regra) => regra.padroes);

  if (objeto === 'INDEFINIDO') {
    return {
      OR: [{ subjectSummary: null }, { NOT: casaAlgumWhere(todosPadroes) }],
    };
  }

  const alternativas: Prisma.VotingWhereInput[] = [];

  REGRAS.forEach((regra, indice) => {
    if (regra.objeto !== objeto) {
      return;
    }

    const anteriores = REGRAS.slice(0, indice).flatMap((r) => r.padroes);

    alternativas.push(
      anteriores.length
        ? {
            AND: [
              casaAlgumWhere(regra.padroes),
              { NOT: casaAlgumWhere(anteriores) },
            ],
          }
        : casaAlgumWhere(regra.padroes),
    );
  });

  return { OR: alternativas };
}

/** Disjuncao das categorias de merito, como `where`. */
export function filtroMeritoWhere(): Prisma.VotingWhereInput {
  return { OR: OBJETOS_DE_MERITO.map(filtroObjetoWhere) };
}

/** Recorte por objeto votado, aceito pelos endpoints que contam votos. */
export type FiltroObjeto = {
  /** Restringe a uma categoria de objeto votado. */
  objeto?: ObjetoVotacao;
  /**
   * Restringe aos votos de merito — onde SIM significa apoio ao que se votou.
   * E o recorte que torna "os temas em que mais vota a favor" defensavel.
   */
  apenasMerito?: boolean;
};

/**
 * Condicao SQL do recorte pedido, ou vazio quando nao ha recorte.
 *
 * Vive aqui, e nao espalhada pelas consultas, para que a lista por tema, os
 * totais e os contadores de exclusao usem exatamente o mesmo filtro — se
 * divergirem, os numeros do payload deixam de fechar entre si.
 *
 * `coluna` e passada pelo chamador porque o alias da tabela `votacao` muda
 * entre as consultas.
 */
export function condicaoDoFiltro(
  filtros: FiltroObjeto,
  coluna: Prisma.Sql,
): Prisma.Sql {
  const partes: Prisma.Sql[] = [];

  if (filtros.objeto) {
    partes.push(filtroObjetoSql(coluna, filtros.objeto));
  }

  if (filtros.apenasMerito) {
    partes.push(filtroMeritoSql(coluna));
  }

  return partes.length
    ? Prisma.sql` AND ${Prisma.join(partes, ' AND ')}`
    : Prisma.empty;
}

/**
 * As condicoes de `where` do recorte pedido, para entrar num `AND`.
 *
 * Devolve lista (e nao um objeto ja combinado) porque o chamador tem outras
 * condicoes para somar no mesmo `AND` — combinar aqui obrigaria a aninhar.
 */
export function condicoesDoFiltroWhere(
  filtros: FiltroObjeto,
): Prisma.VotingWhereInput[] {
  const partes: Prisma.VotingWhereInput[] = [];

  if (filtros.objeto) {
    partes.push(filtroObjetoWhere(filtros.objeto));
  }

  if (filtros.apenasMerito) {
    partes.push(filtroMeritoWhere());
  }

  return partes;
}
