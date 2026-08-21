/**
 * Prova que o classificador de objeto de votacao decide o MESMO em TypeScript
 * e em SQL.
 *
 * A regra vive em `src/domain/objeto-votacao.ts` e e usada de duas formas: em
 * TS para exibir o campo `objeto`, e traduzida para SQL para filtrar a
 * agregacao por tema. Teste unitario cobre o lado TS; so um MySQL real prova o
 * lado SQL — `LIKE`, a collation insensivel a acento e a ordem das regras nao
 * existem num mock.
 *
 * Uso (exige Docker):
 *   bash scripts/verifica-objeto-votacao.sh
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  classificarObjeto,
  ehMerito,
  filtroMeritoSql,
  filtroObjetoSql,
  OBJETOS_VOTACAO,
  ObjetoVotacao,
} from '../src/domain/objeto-votacao';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

/** Casos reais colhidos da producao, com os acentos que o banco guarda. */
const RESUMOS = [
  'Aprovado o parecer.',
  'Aprovado o requerimento.',
  'Aprovada a Redação Final.',
  'Aprovada a Redação Final assinada pelo relator, Dep. Fulano (PP/SP).',
  'Aprovado, por unanimidade, o Requerimento de Urgência (Art. 155 do RICD).',
  'Realizar o encaminhamento do PL-1800/2023 à CFT (tramitação simultânea).',
  'Alteração do regime de tramitação.',
  'Aprovado o Substitutivo ao Projeto de Lei nº 5.415, de 2005.',
  'Aprovada a Proposta de Emenda à Constituição nº 45, de 2019.',
  'Rejeitadas as Emendas ao Substitutivo.',
  'Aprovada a Subemenda da Comissão de Constituição e Justiça.',
  'Aprovado o Projeto de Lei nº 3.083, de 2026.',
  'Aprovada a Medida Provisória nº 1.234, de 2025.',
  'Rejeitado o Destaque para votação em separado.',
  'Aprovado o relatório com complementação de voto.',
  'Aprovada a preferência.',
  'Mantido o texto.',
  'Aprovado.',
  '',
];

const COLUNA = Prisma.sql`va.resumoMateria`;

async function main() {
  await prisma.vote.deleteMany();
  await prisma.votingOrientation.deleteMany();
  await prisma.voting.deleteMany();

  for (const [i, resumo] of RESUMOS.entries()) {
    await prisma.voting.create({
      data: {
        apiId: `obj-${i}`,
        casa: 'Camara',
        votingDate: new Date('2026-05-05T10:00:00'),
        subjectSummary: resumo || null,
      },
    });
  }

  let divergencias = 0;

  console.log(
    `${'objeto (TS)'.padEnd(16)}${'objeto (SQL)'.padEnd(16)}${'merito'.padEnd(8)}resumo`,
  );

  for (const [i, resumo] of RESUMOS.entries()) {
    const emTs = classificarObjeto(resumo);

    // Pergunta ao banco, categoria por categoria, qual delas casa.
    const casadas: ObjetoVotacao[] = [];
    for (const objeto of OBJETOS_VOTACAO) {
      const linhas = await prisma.$queryRaw<{ n: bigint | number }[]>`
        SELECT COUNT(*) AS n FROM votacao va
        WHERE va.idApi = ${`obj-${i}`} AND ${filtroObjetoSql(COLUNA, objeto)}
      `;
      if (Number(linhas[0]?.n ?? 0) > 0) {
        casadas.push(objeto);
      }
    }

    const emSql = casadas.length === 1 ? casadas[0] : `AMBIGUO:${casadas.join('|')}`;
    const igual = emSql === emTs;
    if (!igual) divergencias += 1;

    console.log(
      `${emTs.padEnd(16)}${String(emSql).padEnd(16)}` +
        `${(ehMerito(emTs) ? 'sim' : 'nao').padEnd(8)}` +
        `${igual ? '' : '<<< DIVERGE  '}${(resumo || '(vazio)').slice(0, 58)}`,
    );
  }

  // O filtro de merito precisa bater com a soma das categorias de merito.
  const [{ n }] = await prisma.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(*) AS n FROM votacao va WHERE ${filtroMeritoSql(COLUNA)}
  `;
  const esperado = RESUMOS.filter((r) => ehMerito(classificarObjeto(r))).length;

  console.log(`\nfiltro de merito: SQL=${Number(n)} TS=${esperado}`);
  if (Number(n) !== esperado) divergencias += 1;

  console.log(divergencias === 0 ? '\nOK: TS e SQL classificam identico.' : `\nFALHA: ${divergencias} divergencia(s).`);
  process.exitCode = divergencias === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
