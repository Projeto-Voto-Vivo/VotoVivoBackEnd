/**
 * Prova que a regra de pertencimento de bancada funciona no banco.
 *
 * O `AlignmentService` decide se uma bancada representa o partido do
 * parlamentar. Isso vive em SQL (`FIND_IN_SET` sobre o nome da bancada), e SQL
 * nao existe num mock: a collation insensivel a acento, o `SUBSTRING` do
 * prefixo e a ausencia de falso positivo por substring so se provam contra um
 * MySQL real.
 *
 * O bug que este script existe para nao deixar voltar: a comparacao era por
 * igualdade exata, e o dump da Camara publica a bancada do PT como
 * "Fdr PT-PCdoB-PV". Todo deputado de federacao — 19% da Camara, incluindo a
 * maior bancada do plenario — ficava com ZERO comparacoes, e a fidelidade
 * partidaria dele era silenciosamente impossivel de calcular.
 *
 * Uso: bash scripts/verifica-bancada.sh   (exige Docker)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { AlignmentService } from '../src/services/alignment.service';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

/** As tres formas em que a Camara publica uma bancada, com um caso de cada. */
const CASOS = [
  { partido: 'PL', bancadaEsperada: 'PL', resolve: true, nota: 'sigla simples' },
  { partido: 'PT', bancadaEsperada: 'Fdr PT-PCdoB-PV', resolve: true, nota: 'federacao, 1o token' },
  { partido: 'PCdoB', bancadaEsperada: 'Fdr PT-PCdoB-PV', resolve: true, nota: 'federacao, token do meio' },
  { partido: 'PSOL', bancadaEsperada: 'Fdr PSOL-REDE', resolve: true, nota: 'federacao, outra' },
  { partido: 'PP', bancadaEsperada: 'Bl UniPpPsd...', resolve: false, nota: 'bloco abreviado — nao resolve' },
];

const VOTACOES = 25; // acima de MINIMO_PARA_TAXA, para a taxa ser publicada

async function main() {
  await prisma.vote.deleteMany();
  await prisma.votingOrientation.deleteMany();
  await prisma.voting.deleteMany();
  await prisma.partyAffiliation.deleteMany();
  await prisma.parliamentarian.deleteMany();

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
        orientations: {
          create: [
            { bench: 'PL', orientation: 'Sim' },
            { bench: 'Fdr PT-PCdoB-PV', orientation: 'Nao' },
            { bench: 'Fdr PSOL-REDE', orientation: 'Nao' },
            { bench: 'Bl UniPpPsd...', orientation: 'Sim' },
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

    const resolveu = r.consideradas === VOTACOES;
    const naoResolveu = r.consideradas === 0 && r.bancadaNaoResolvida === VOTACOES;
    const ok = caso.resolve ? resolveu : naoResolveu;
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
      ? '\nOK: federacoes resolvem, blocos sao declarados, e PP nao casa dentro de "UniPpPsd".'
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
