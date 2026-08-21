/**
 * Prova os filtros de `GET /parlamentares/:id/votacoes` contra o banco.
 *
 * O `where` e testado em unitario, mas o que ele SIGNIFICA no MySQL nao:
 *
 *  - `proposition: { is: ... }` numa relacao opcional exclui a votacao sem
 *    proposicao. E o contrato da rota — requerimento e questao de ordem somem
 *    assim que um filtro de proposicao entra — e ele vale por semantica do
 *    Prisma, nao por codigo nosso. Se mudar, muda em silencio;
 *  - a collation `utf8mb4_unicode_ci` faz `busca` e `tema` ignorarem acento:
 *    "Saude" acha "Saúde". Sem isso, todo dropdown com acento devolveria vazio;
 *  - o contador de excluidos respeita o recorte de objeto, senao declararia
 *    como perdidas votacoes que o filtro de objeto ja tinha tirado.
 *
 * Uso: bash scripts/verifica-filtros-votacoes.sh   (exige Docker)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { ParliamentarianService } from '../src/services/parliamentarian.service';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const MERITO = 'Aprovado o Projeto de Lei';
const PEC = 'Aprovada a Proposta de Emenda a Constituicao';
const RITO = 'Aprovado o requerimento de urgencia';

async function main() {
  await prisma.vote.deleteMany();
  await prisma.voting.deleteMany();
  await prisma.temaProposicao.deleteMany();
  await prisma.tema.deleteMany();
  await prisma.proposition.deleteMany();
  await prisma.propositionType.deleteMany();
  await prisma.parliamentarian.deleteMany();

  const deputado = await prisma.parliamentarian.create({
    data: { apiId: 'p-1', role: 'Deputado(a)', ballotName: 'Deputada', currentParty: 'PT' },
  });

  const tipo = async (sigla: string) =>
    (await prisma.propositionType.create({
      data: { sigla, nome: sigla, casa: 'Camara' },
    })).id;

  const pl = await tipo('PL');
  const pec = await tipo('PEC');

  // Acentuados de proposito: as consultas abaixo perguntam sem acento.
  const tema = async (descricao: string, codigo: number) =>
    (await prisma.tema.create({
      data: { codigoExterno: codigo, casa: 'Camara', descricao },
    })).idTema;

  const saude = await tema('Saúde', 1);
  const educacao = await tema('Educação', 2);

  const proposicao = async (
    apiId: string,
    typeId: number,
    year: number,
    summary: string,
    temas: number[],
  ) => {
    const criada = await prisma.proposition.create({
      data: { apiId, house: 'Camara', typeId, year, summary },
    });

    for (const idTema of temas) {
      await prisma.temaProposicao.create({
        data: { idProposicao: criada.id, idTema },
      });
    }

    return criada.id;
  };

  const p1 = await proposicao('P1', pl, 2025, 'Merenda escolar nas escolas públicas', [saude, educacao]);
  const p2 = await proposicao('P2', pec, 2024, 'Reforma administrativa', [saude]);
  const p3 = await proposicao('P3', pl, 2025, 'Outro assunto qualquer', []);

  const votacao = async (apiId: string, propositionId: number | null, resumo: string) => {
    const criada = await prisma.voting.create({
      data: {
        apiId,
        casa: 'Camara',
        propositionId,
        votingDate: new Date('2026-03-10T15:00:00'),
        subjectSummary: resumo,
      },
    });

    await prisma.vote.create({
      data: {
        idApi: `vt-${apiId}`,
        parliamentarianId: deputado.id,
        votingId: criada.id,
        choice: 'SIM',
      },
    });
  };

  await votacao('v1', p1, MERITO);
  await votacao('v2', p1, RITO);
  await votacao('v3', p2, PEC);
  await votacao('v4', p3, MERITO);
  // Sem proposicao: so casam por `busca` no proprio resumo.
  await votacao('v5', null, 'Aprovado o requerimento sobre merenda');
  await votacao('v6', null, 'Questao de ordem');

  const service = new ParliamentarianService(prisma);

  const CASOS: {
    o: string;
    filtros: Parameters<typeof service.listVotingsByParliamentarianId>[1];
    total: number;
    excluidos: number;
  }[] = [
    { o: 'sem filtro', filtros: {}, total: 6, excluidos: 0 },

    // As duas votacoes sem proposicao saem, e o payload diz que sairam.
    { o: 'proposicao=P1', filtros: { proposicao: p1 }, total: 2, excluidos: 2 },
    { o: 'tipo=PL', filtros: { tipo: 'PL' }, total: 3, excluidos: 2 },
    { o: 'tipo=pl (minusculo)', filtros: { tipo: 'pl' }, total: 3, excluidos: 2 },
    { o: 'ano=2024', filtros: { ano: 2024 }, total: 1, excluidos: 2 },

    // Dropdown manda "Saude"; o banco guarda "Saúde".
    { o: 'tema=Saude (sem acento)', filtros: { tema: 'Saude' }, total: 3, excluidos: 2 },
    { o: 'tema=Educacao', filtros: { tema: 'Educacao' }, total: 2, excluidos: 2 },

    // `busca` nao exige proposicao: v5 casa pelo resumo da propria votacao.
    { o: 'busca=merenda', filtros: { busca: 'merenda' }, total: 3, excluidos: 0 },
    { o: 'busca=publicas (sem acento)', filtros: { busca: 'publicas' }, total: 2, excluidos: 0 },
    // Com tipo junto, v5 sai — e ai ha exclusao a declarar.
    { o: 'busca=merenda&tipo=PL', filtros: { busca: 'merenda', tipo: 'PL' }, total: 2, excluidos: 2 },

    { o: 'apenasMerito', filtros: { apenasMerito: true }, total: 3, excluidos: 0 },
    { o: 'objeto=REQUERIMENTO', filtros: { objeto: 'REQUERIMENTO' }, total: 2, excluidos: 0 },
    // Nenhuma das sem-proposicao e de merito: nada a declarar como excluido.
    { o: 'tipo=PL&apenasMerito', filtros: { tipo: 'PL', apenasMerito: true }, total: 2, excluidos: 0 },

    // Combinacao nao pode um filtro sobrescrever o outro.
    { o: 'tipo=PL&ano=2024', filtros: { tipo: 'PL', ano: 2024 }, total: 0, excluidos: 2 },
    { o: 'tema=Saude&ano=2025', filtros: { tema: 'Saude', ano: 2025 }, total: 2, excluidos: 2 },
  ];

  let falhas = 0;

  console.log(`${'filtro'.padEnd(30)}${'total'.padStart(7)}${'excl.'.padStart(7)}`);

  for (const caso of CASOS) {
    const r = await service.listVotingsByParliamentarianId(deputado.id, caso.filtros);
    const excluidos = r.meta.excluidos.votacoesSemProposicao;
    const ok = r.meta.total === caso.total && excluidos === caso.excluidos;
    if (!ok) falhas += 1;

    console.log(
      `${caso.o.padEnd(30)}${String(r.meta.total).padStart(7)}${String(excluidos).padStart(7)}` +
        `${ok ? '' : `   <<< esperado ${caso.total}/${caso.excluidos}`}`,
    );
  }

  // A pagina precisa conter o que o total promete, e nao o universo recortado
  // depois: se o filtro fosse aplicado em memoria, `data` teria linhas a mais.
  const pagina = await service.listVotingsByParliamentarianId(deputado.id, { tipo: 'PL' });
  const todasSaoPl = pagina.data.every((v) => v.proposicao?.tipo === 'PL');
  if (!todasSaoPl) falhas += 1;
  console.log(`${'pagina so com PL'.padEnd(30)}${String(todasSaoPl).padStart(7)}`);

  console.log(
    falhas === 0
      ? '\nOK: filtros recortam no banco, acento nao atrapalha, e as sem proposicao sao declaradas.'
      : `\nFALHA: ${falhas} caso(s) fora do esperado.`,
  );
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
