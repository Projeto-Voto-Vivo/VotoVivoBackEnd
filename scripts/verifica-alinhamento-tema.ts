/**
 * Prova que a fidelidade partidaria por tema fecha as contas no banco.
 *
 * O `ThemeAlignmentService` tem uma subquery correlacionada DENTRO da condicao
 * de JOIN, sob um GROUP BY, atravessando cinco tabelas. Um mock de `$queryRaw`
 * prova a dobra em TypeScript e nada sobre o SQL: se o MySQL contar diferente,
 * o teste unitario continua verde.
 *
 * O que este script fixa, e que a soma dos numeros esconderia:
 *
 *  - a soma dos temas e MAIOR que o total, porque uma proposicao com dois temas
 *    faz o voto contar nos dois. Se um dia passarem a bater, alguem
 *    "consertou" isso e a lista virou outra coisa;
 *  - votos sem proposicao e em proposicao sem tema saem da lista e aparecem em
 *    `excluidos` — se sumirem, o vies fica invisivel;
 *  - "Liberado" nao entra no denominador de tema nenhum;
 *  - `apenasMerito` recorta a lista E o bloco `geral`. Se so a lista respondesse
 *    ao filtro, a interface compararia duas populacoes diferentes achando que
 *    compara a mesma.
 *
 * Uso: bash scripts/verifica-alinhamento-tema.sh   (exige Docker)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { ThemeAlignmentService } from '../src/services/theme-alignment.service';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const MEIO_AMBIENTE = 'Meio Ambiente e Desenvolvimento Sustentavel';
const DIREITO_PENAL = 'Direito Penal e Processual Penal';

/** Classificado como TEXTO_BASE por `classificarObjeto`; entra no merito. */
const MERITO = 'Aprovacao do Projeto de Lei';
/** Classificado como REQUERIMENTO; o voto e sobre o rito, nao sobre o tema. */
const RITO = 'Requerimento de urgencia';

/**
 * O cenario, em votacoes. O deputado vota SIM em TODAS: seguiu = orientacao
 * "Sim", divergiu = orientacao "Nao".
 */
const CENARIO = [
  { proposicao: 'P1', temas: [MEIO_AMBIENTE], orientacao: 'Nao', quantas: 12, resumo: MERITO },
  { proposicao: 'P1', temas: [MEIO_AMBIENTE], orientacao: 'Liberado', quantas: 3, resumo: MERITO },
  { proposicao: 'P2', temas: [MEIO_AMBIENTE, DIREITO_PENAL], orientacao: 'Sim', quantas: 15, resumo: MERITO },
  { proposicao: 'P2', temas: [MEIO_AMBIENTE, DIREITO_PENAL], orientacao: 'Sim', quantas: 6, resumo: RITO },
  // Fora de qualquer tema: entram no geral, saem da lista, viram `excluidos`.
  { proposicao: 'P3', temas: [], orientacao: 'Sim', quantas: 4, resumo: MERITO },
  { proposicao: null, temas: [], orientacao: 'Sim', quantas: 7, resumo: MERITO },
];

type Verificacao = { o: string; obtido: unknown; esperado: unknown };

async function main() {
  await prisma.vote.deleteMany();
  await prisma.votingOrientation.deleteMany();
  await prisma.voting.deleteMany();
  await prisma.temaProposicao.deleteMany();
  await prisma.tema.deleteMany();
  await prisma.proposition.deleteMany();
  await prisma.partyAffiliation.deleteMany();
  await prisma.parliamentarian.deleteMany();
  await prisma.blocParty.deleteMany();
  await prisma.bloc.deleteMany();

  const deputado = await prisma.parliamentarian.create({
    data: {
      apiId: 'p-1',
      role: 'Deputado(a)',
      ballotName: 'Deputada do PT',
      currentParty: 'PT',
    },
  });

  const federacao = await prisma.bloc.create({
    data: {
      apiId: 'f1',
      name: 'Fdr PT-PCdoB-PV',
      federation: true,
      parties: { create: [{ party: 'PT', ordem: 1 }, { party: 'PCdoB', ordem: 2 }] },
    },
  });

  const temas: Record<string, number> = {};
  for (const [indice, descricao] of [MEIO_AMBIENTE, DIREITO_PENAL].entries()) {
    const criado = await prisma.tema.create({
      data: { codigoExterno: 100 + indice, casa: 'Camara', descricao },
    });
    temas[descricao] = criado.idTema;
  }

  const proposicoes: Record<string, number> = {};
  for (const nome of ['P1', 'P2', 'P3']) {
    const criada = await prisma.proposition.create({
      data: { apiId: nome, house: 'Camara', summary: `Ementa da ${nome}` },
    });
    proposicoes[nome] = criada.id;
  }

  for (const linha of CENARIO) {
    for (const tema of linha.temas) {
      await prisma.temaProposicao.upsert({
        where: {
          idProposicao_idTema: {
            idProposicao: proposicoes[linha.proposicao!],
            idTema: temas[tema],
          },
        },
        create: { idProposicao: proposicoes[linha.proposicao!], idTema: temas[tema] },
        update: {},
      });
    }
  }

  let sequencia = 0;

  for (const linha of CENARIO) {
    for (let i = 0; i < linha.quantas; i += 1) {
      sequencia += 1;

      const votacao = await prisma.voting.create({
        data: {
          apiId: `v-${sequencia}`,
          casa: 'Camara',
          propositionId: linha.proposicao ? proposicoes[linha.proposicao] : null,
          votingDate: new Date('2026-03-10T15:00:00'),
          subjectSummary: linha.resumo,
          orientations: {
            create: [
              { bench: 'Fdr PT-PCdoB-PV', orientation: linha.orientacao, blocId: federacao.id },
              // Transversal: existe, nao representa partido nenhum.
              { bench: 'Governo', orientation: 'Sim' },
            ],
          },
        },
      });

      await prisma.vote.create({
        data: {
          idApi: `vt-${sequencia}`,
          parliamentarianId: deputado.id,
          votingId: votacao.id,
          choice: 'SIM',
        },
      });
    }
  }

  const service = new ThemeAlignmentService(prisma);

  const tudo = await service.getThemeAlignment(deputado.id);
  const merito = await service.getThemeAlignment(deputado.id, 10, { apenasMerito: true });

  const de = (r: typeof tudo, tema: string) => r.temas.find((t) => t.tema === tema);
  const soma = (r: typeof tudo) => r.temas.reduce((acc, t) => acc + t.consideradas, 0);

  const verificacoes: Verificacao[] = [
    // ---- sem recorte: 15 + 6 "Sim" seguidos, 12 "Nao" divergidos, 4 + 7 fora de tema
    { o: 'geral.consideradas', obtido: tudo.geral.consideradas, esperado: 44 },
    { o: 'geral.seguiu', obtido: tudo.geral.seguiu, esperado: 32 },
    { o: 'geral.divergiu', obtido: tudo.geral.divergiu, esperado: 12 },
    { o: 'geral.liberadas', obtido: tudo.geral.liberadas, esperado: 3 },

    // P1 (12 divergiu) + P2 (15 + 6 seguiu); as 3 liberadas ficam de fora.
    { o: 'meioAmbiente.consideradas', obtido: de(tudo, MEIO_AMBIENTE)?.consideradas, esperado: 33 },
    { o: 'meioAmbiente.seguiu', obtido: de(tudo, MEIO_AMBIENTE)?.seguiu, esperado: 21 },
    { o: 'meioAmbiente.divergiu', obtido: de(tudo, MEIO_AMBIENTE)?.divergiu, esperado: 12 },
    { o: 'meioAmbiente.liberadas', obtido: de(tudo, MEIO_AMBIENTE)?.liberadas, esperado: 3 },
    { o: 'meioAmbiente.taxa', obtido: de(tudo, MEIO_AMBIENTE)?.taxa, esperado: 63.6 },

    // So P2 — e P2 tambem esta em meio ambiente: o voto conta nos dois.
    { o: 'direitoPenal.consideradas', obtido: de(tudo, DIREITO_PENAL)?.consideradas, esperado: 21 },
    { o: 'direitoPenal.taxa', obtido: de(tudo, DIREITO_PENAL)?.taxa, esperado: 100 },

    // O ponto que o payload avisa e a interface tende a ignorar.
    { o: 'soma dos temas > geral', obtido: soma(tudo) > tudo.geral.consideradas, esperado: true },
    { o: 'soma dos temas', obtido: soma(tudo), esperado: 54 },

    { o: 'excluidos.semProposicao', obtido: tudo.excluidos.votosSemProposicao, esperado: 7 },
    { o: 'excluidos.semTema', obtido: tudo.excluidos.votosEmProposicaoSemTema, esperado: 4 },

    // Por evidencia, nao por taxa: penal tem 100% e vem depois.
    {
      o: 'ordem',
      obtido: tudo.temas.map((t) => t.tema).join(' | '),
      esperado: `${MEIO_AMBIENTE} | ${DIREITO_PENAL}`,
    },

    // ---- com apenasMerito: as 6 votacoes de requerimento saem dos DOIS lados
    { o: 'merito geral.consideradas', obtido: merito.geral.consideradas, esperado: 38 },
    { o: 'merito geral.seguiu', obtido: merito.geral.seguiu, esperado: 26 },
    { o: 'merito meioAmbiente', obtido: de(merito, MEIO_AMBIENTE)?.consideradas, esperado: 27 },
    { o: 'merito direitoPenal', obtido: de(merito, DIREITO_PENAL)?.consideradas, esperado: 15 },
    { o: 'merito meioAmbiente.taxa', obtido: de(merito, MEIO_AMBIENTE)?.taxa, esperado: 55.6 },
    // Se o filtro so pegasse a lista, esta diferenca seria 0 de um lado so.
    {
      o: 'recorte tirou dos dois lados',
      obtido: tudo.geral.consideradas - merito.geral.consideradas === 6
        && soma(tudo) - soma(merito) === 12,
      esperado: true,
    },
    { o: 'metadata.filtroAplicadoAoGeral', obtido: merito.metadata.filtroAplicadoAoGeral, esperado: true },
  ];

  let falhas = 0;

  for (const v of verificacoes) {
    const ok = JSON.stringify(v.obtido) === JSON.stringify(v.esperado);
    if (!ok) falhas += 1;

    console.log(
      `${ok ? 'ok   ' : 'FALHA'} ${v.o.padEnd(32)}${String(v.obtido).padStart(10)}` +
        `${ok ? '' : `   esperado ${String(v.esperado)}`}`,
    );
  }

  console.log(
    falhas === 0
      ? '\nOK: os temas fecham com o geral, a diferenca esta declarada, e o recorte vale para os dois.'
      : `\nFALHA: ${falhas} verificacao(oes) fora do esperado.`,
  );
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
