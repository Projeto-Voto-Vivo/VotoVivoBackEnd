/**
 * Prova que a regra de pertencimento de bancada funciona no banco.
 *
 * O `AlignmentService` decide se uma bancada representa o partido do
 * parlamentar. Isso vive em SQL, e SQL nao existe num mock.
 *
 * A resolucao vem pronta do ETL, em `orientacaoVotacao.siglaPartido` (bancada
 * de partido) e `.idBloco` (bloco ou federacao), apurada contra a composicao
 * real de `blocoPartido`.
 *
 * O bug que este script existe para nao deixar voltar: a comparacao ja foi por
 * igualdade exata contra o NOME da bancada. Como a Camara publica a bancada do
 * PT como "Fdr PT-PCdoB-PV", todo deputado de federacao — 19% da Camara,
 * incluindo a maior bancada do plenario — ficava com ZERO comparacoes, em
 * silencio. A versao seguinte parseava o nome, o que resolvia federacoes mas
 * nunca blocos ("Bl UniPpPsd..." vem abreviado e truncado).
 *
 * Uso: bash scripts/verifica-bancada.sh   (exige Docker)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { AlignmentService } from '../src/services/alignment.service';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

/** Mesmo valor de VOTACOES; declarado antes para a tabela de casos usar. */
const VOTACOES_ESPERADAS = 25;

/**
 * Um caso por forma de a Camara publicar uma bancada.
 *
 * `seguiu` so aparece onde a orientacao ESCOLHIDA importa: em todos os casos a
 * pessoa vota SIM, entao seguiu = quantas vezes a bancada dela orientou "Sim".
 */
const CASOS = [
  { partido: 'PL', resolve: true, nota: 'bancada de partido' },
  { partido: 'PT', resolve: true, nota: 'federacao' },
  { partido: 'PCdoB', resolve: true, nota: 'federacao, partido do meio' },
  { partido: 'PSOL', resolve: true, nota: 'outra federacao' },
  { partido: 'PP', resolve: true, nota: 'bloco — antes NAO resolvia' },
  { partido: 'MDB', resolve: false, nota: 'fora de bloco e sem bancada propria' },
  // O PV esta na federacao do PT (que orienta "Nao") E tem bancada propria
  // (que orienta "Sim"). Duas bancadas representam o partido dele na MESMA
  // votacao. Sem escolher uma, o voto entra duas vezes e ele aparece seguindo
  // e divergindo ao mesmo tempo.
  { partido: 'PV', resolve: true, seguiu: VOTACOES_ESPERADAS, nota: 'partido + federacao: conta uma vez, partido ganha' },
];

const VOTACOES = VOTACOES_ESPERADAS; // acima de MINIMO_PARA_TAXA, para a taxa sair

async function main() {
  await prisma.vote.deleteMany();
  await prisma.votingOrientation.deleteMany();
  await prisma.voting.deleteMany();
  await prisma.partyAffiliation.deleteMany();
  await prisma.parliamentarian.deleteMany();
  await prisma.blocParty.deleteMany();
  await prisma.bloc.deleteMany();

  // Composicao real, como o camara/bloco_camara.py grava.
  const criarBloco = async (
    apiId: string,
    name: string,
    federation: boolean,
    partidos: string[],
  ) => {
    const criado = await prisma.bloc.create({
      data: {
        apiId,
        name,
        federation,
        parties: { create: partidos.map((party, i) => ({ party, ordem: i + 1 })) },
      },
    });
    return criado.id;
  };

  const blocos = {
    federacaoPt: await criarBloco('f1', 'Fdr PT-PCdoB-PV', true, ['PT', 'PCdoB', 'PV']),
    federacaoPsol: await criarBloco('f2', 'Fdr PSOL-REDE', true, ['PSOL', 'REDE']),
    bloco: await criarBloco('b1', 'Bl UniPpPsd...', false, ['UNIAO', 'PP', 'PSD']),
  };

  const ids: Record<string, number> = {};
  for (const caso of CASOS) {
    const criado = await prisma.parliamentarian.create({
      data: {
        apiId: `p-${caso.partido}`,
        role: 'Deputado(a)',
        ballotName: `Deputado do ${caso.partido}`,
        currentParty: caso.partido,
      },
    });
    ids[caso.partido] = criado.id;
  }

  for (let i = 1; i <= VOTACOES; i += 1) {
    const votacao = await prisma.voting.create({
      data: {
        apiId: `v-${i}`,
        casa: 'Camara',
        votingDate: new Date('2026-03-10T15:00:00'),
        // `bench` continua sendo o nome cru do dump; o que o backend le sao
        // `party` e `blocId`, resolvidos pelo ETL.
        orientations: {
          create: [
            { bench: 'PL', orientation: 'Sim', party: 'PL' },
            { bench: 'Fdr PT-PCdoB-PV', orientation: 'Nao', blocId: blocos.federacaoPt },
            { bench: 'Fdr PSOL-REDE', orientation: 'Nao', blocId: blocos.federacaoPsol },
            { bench: 'Bl UniPpPsd...', orientation: 'Sim', blocId: blocos.bloco },
            // Bancada propria de um partido que TAMBEM esta numa federacao.
            { bench: 'PV', orientation: 'Sim', party: 'PV' },
            // Bancada transversal: nao representa partido nenhum.
            { bench: 'Governo', orientation: 'Sim' },
          ],
        },
      },
    });

    for (const caso of CASOS) {
      await prisma.vote.create({
        data: {
          idApi: `vt-${i}-${caso.partido}`,
          parliamentarianId: ids[caso.partido],
          votingId: votacao.id,
          // Todos votam SIM: quem tem orientacao "Nao" deve aparecer divergindo.
          choice: 'SIM',
        },
      });
    }
  }

  const service = new AlignmentService(prisma);
  let falhas = 0;

  console.log(
    `${'partido'.padEnd(8)}${'considera'.padStart(10)}${'seguiu'.padStart(8)}` +
      `${'divergiu'.padStart(10)}${'naoResolv'.padStart(11)}  ${'resultado'.padEnd(24)}nota`,
  );

  for (const caso of CASOS) {
    const r = await service.getAlignmentByParliamentarianId(ids[caso.partido]);

    // `=== VOTACOES` e nao `> 0`: se duas bancadas representassem o partido e
    // as duas entrassem, dariam 50 comparacoes para 25 votacoes.
    const resolveu = r.consideradas === VOTACOES;
    const naoResolveu = r.consideradas === 0 && r.bancadaNaoResolvida === VOTACOES;
    const seguiuOk = caso.seguiu === undefined || r.seguiu === caso.seguiu;
    const ok = (caso.resolve ? resolveu : naoResolveu) && seguiuOk;
    if (!ok) falhas += 1;

    console.log(
      `${caso.partido.padEnd(8)}${String(r.consideradas).padStart(10)}` +
        `${String(r.seguiu).padStart(8)}${String(r.divergiu).padStart(10)}` +
        `${String(r.bancadaNaoResolvida).padStart(11)}  ` +
        `${(r.motivo ?? `taxa=${r.taxa}%`).padEnd(24)}` +
        `${ok ? '' : '<<< FALHOU  '}${caso.nota}`,
    );
  }

  console.log(
    falhas === 0
      ? '\nOK: partido, federacao e bloco resolvem; uma orientacao por votacao; transversal declarada.'
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
