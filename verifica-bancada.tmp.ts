/**
 * Valida a regra de pertencimento de bancada contra um MySQL real.
 *
 * Mock nao valida SQL: `FIND_IN_SET`, `SUBSTRING` e a collation so se provam no
 * banco. Este script semeia os tres formatos de bancada que a Camara publica e
 * confere quem casa com quem.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { AlignmentService } from './src/services/alignment.service';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.vote.deleteMany();
  await prisma.votingOrientation.deleteMany();
  await prisma.voting.deleteMany();
  await prisma.partyAffiliation.deleteMany();
  await prisma.parliamentarian.deleteMany();

  // Um deputado por situacao real do dump.
  const casos = [
    { apiId: 'p-pl', partido: 'PL', nome: 'Deputado do PL' },
    { apiId: 'p-pt', partido: 'PT', nome: 'Deputado do PT' },
    { apiId: 'p-psol', partido: 'PSOL', nome: 'Deputado do PSOL' },
    { apiId: 'p-pcdob', partido: 'PCdoB', nome: 'Deputado do PCdoB' },
    { apiId: 'p-pp', partido: 'PP', nome: 'Deputado do PP (bloco)' },
  ];

  const deputados: Record<string, number> = {};
  for (const c of casos) {
    const d = await prisma.parliamentarian.create({
      data: { apiId: c.apiId, role: 'Deputado(a)', ballotName: c.nome, currentParty: c.partido },
    });
    deputados[c.partido] = d.id;
  }

  // 25 votacoes, cada uma com as bancadas nos tres formatos.
  for (let i = 1; i <= 25; i += 1) {
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

    for (const c of casos) {
      await prisma.vote.create({
        data: {
          idApi: `vt-${i}-${c.partido}`,
          parliamentarianId: deputados[c.partido],
          votingId: votacao.id,
          // Todos votam SIM: quem tem orientacao "Nao" deve aparecer divergindo.
          choice: 'SIM',
        },
      });
    }
  }

  const service = new AlignmentService(prisma);

  console.log(
    `${'partido'.padEnd(10)}${'consideradas'.padStart(13)}${'seguiu'.padStart(8)}` +
      `${'divergiu'.padStart(10)}${'naoResolvida'.padStart(14)}  motivo`,
  );

  for (const c of casos) {
    const r = await service.getAlignmentByParliamentarianId(deputados[c.partido]);
    console.log(
      `${c.partido.padEnd(10)}${String(r.consideradas).padStart(13)}` +
        `${String(r.seguiu).padStart(8)}${String(r.divergiu).padStart(10)}` +
        `${String(r.bancadaNaoResolvida).padStart(14)}  ${r.motivo ?? `taxa=${r.taxa}%`}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
