import { PrismaClient, VoteChoice } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.vote.deleteMany();
  await prisma.propositionAuthor.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.socialNetwork.deleteMany();
  await prisma.voting.deleteMany();
  await prisma.proposition.deleteMany();
  await prisma.parliamentarian.deleteMany();

  const parliamentarian1 = await prisma.parliamentarian.create({
    data: {
      apiId: 1001,
      role: 'Deputado Federal',
      civilName: 'João Carlos da Silva',
      ballotName: 'João da Silva',
      currentParty: 'PT',
      state: 'SP',
      photoUrl: 'https://example.com/photos/joao-da-silva.jpg',
      birthDate: new Date('1980-05-10'),
      email: 'joao.silva@camara.leg.br',
      phone: '(61) 3215-1001',
      officeAddress: 'Anexo IV, Gabinete 101',
      socialNetworks: {
        create: [
          {
            platform: 'Instagram',
            url: 'https://instagram.com/joaodasilva',
          },
          {
            platform: 'X',
            url: 'https://x.com/joaodasilva',
          },
        ],
      },
      expenses: {
        create: [
          {
            expenseDate: new Date('2024-01-15'),
            amount: 1200.5,
            supplierName: 'Companhia Aérea Brasil',
            supplierDocument: '12.345.678/0001-90',
            invoiceUrl: 'https://example.com/invoices/expense-1.pdf',
            category: 'Emissão de Bilhete Aéreo',
          },
          {
            expenseDate: new Date('2024-02-10'),
            amount: 850.0,
            supplierName: 'Hotel Brasília',
            supplierDocument: '98.765.432/0001-10',
            invoiceUrl: 'https://example.com/invoices/expense-2.pdf',
            category: 'Hospedagem',
          },
          {
            expenseDate: new Date('2024-02-20'),
            amount: 430.75,
            supplierName: 'Gráfica Nacional',
            supplierDocument: '11.222.333/0001-44',
            invoiceUrl: 'https://example.com/invoices/expense-3.pdf',
            category: 'Divulgação da Atividade Parlamentar',
          },
        ],
      },
    },
  });

  const parliamentarian2 = await prisma.parliamentarian.create({
    data: {
      apiId: 1002,
      role: 'Deputada Federal',
      civilName: 'Maria Fernanda Oliveira',
      ballotName: 'Maria Oliveira',
      currentParty: 'PSB',
      state: 'RJ',
      photoUrl: 'https://example.com/photos/maria-oliveira.jpg',
      birthDate: new Date('1985-09-22'),
      email: 'maria.oliveira@camara.leg.br',
      phone: '(61) 3215-1002',
      officeAddress: 'Anexo IV, Gabinete 202',
      socialNetworks: {
        create: [
          {
            platform: 'Facebook',
            url: 'https://facebook.com/mariaoliveira',
          },
          {
            platform: 'Instagram',
            url: 'https://instagram.com/mariaoliveira',
          },
        ],
      },
      expenses: {
        create: [
          {
            expenseDate: new Date('2024-01-05'),
            amount: 300.0,
            supplierName: 'Posto Central',
            supplierDocument: '22.333.444/0001-55',
            invoiceUrl: 'https://example.com/invoices/expense-4.pdf',
            category: 'Combustíveis e Lubrificantes',
          },
          {
            expenseDate: new Date('2024-03-01'),
            amount: 980.9,
            supplierName: 'Agência de Comunicação BR',
            supplierDocument: '55.444.333/0001-22',
            invoiceUrl: 'https://example.com/invoices/expense-5.pdf',
            category: 'Divulgação da Atividade Parlamentar',
          },
        ],
      },
    },
  });

  const proposition1 = await prisma.proposition.create({
    data: {
      apiId: 2001,
      typeAbbreviation: 'PL',
      number: 1234,
      year: 2024,
      summary: 'Dispõe sobre incentivo à transparência pública digital.',
      currentStatus: 'Em tramitação',
    },
  });

  const proposition2 = await prisma.proposition.create({
    data: {
      apiId: 2002,
      typeAbbreviation: 'PEC',
      number: 45,
      year: 2024,
      summary: 'Altera dispositivos sobre participação cidadã em processos legislativos.',
      currentStatus: 'Aguardando parecer',
    },
  });

  await prisma.propositionAuthor.createMany({
    data: [
      {
        parliamentarianId: parliamentarian1.id,
        propositionId: proposition1.id,
      },
      {
        parliamentarianId: parliamentarian2.id,
        propositionId: proposition1.id,
      },
      {
        parliamentarianId: parliamentarian2.id,
        propositionId: proposition2.id,
      },
    ],
  });

  const voting1 = await prisma.voting.create({
    data: {
      apiId: 3001,
      propositionId: proposition1.id,
      votingDate: new Date('2024-03-15'),
      subjectSummary: 'Votação do PL 1234/2024 sobre transparência pública digital.',
      finalResult: 'Aprovado',
      votingType: 'Nominal',
    },
  });

  const voting2 = await prisma.voting.create({
    data: {
      apiId: 3002,
      propositionId: proposition2.id,
      votingDate: new Date('2024-03-20'),
      subjectSummary: 'Votação da PEC 45/2024 sobre participação cidadã.',
      finalResult: 'Rejeitado',
      votingType: 'Nominal',
    },
  });

  await prisma.vote.createMany({
    data: [
      {
        parliamentarianId: parliamentarian1.id,
        votingId: voting1.id,
        choice: VoteChoice.YES,
      },
      {
        parliamentarianId: parliamentarian2.id,
        votingId: voting1.id,
        choice: VoteChoice.YES,
      },
      {
        parliamentarianId: parliamentarian1.id,
        votingId: voting2.id,
        choice: VoteChoice.NO,
      },
      {
        parliamentarianId: parliamentarian2.id,
        votingId: voting2.id,
        choice: VoteChoice.ABSTENTION,
      },
    ],
  });

  console.log('Seed executada com sucesso.');
}

main()
  .catch((error) => {
    console.error('Erro ao executar seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
