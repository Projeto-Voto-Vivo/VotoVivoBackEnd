import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

/**
 * Seed de desenvolvimento. Reproduz, em miniatura, os casos que o plano de
 * integracao com o ETL exige que sejam verificaveis localmente:
 *
 *  - voto OBSTRUCAO e NAO REGISTRADO (o enum antigo derrubava esses endpoints);
 *  - senador empossado no meio do mandato, com evento anterior a posse
 *    (a presenca precisa exclui-lo do denominador);
 *  - "Sessao Nao Deliberativa Solene" (o `includes('deliberativa')` antigo
 *    classificava como deliberativa);
 *  - eventos de plenario e de comissao (taxas distintas);
 *  - orientacao de bancada, filiacao partidaria com troca de partido no meio
 *    do mandato, comissoes, emendas e despesas.
 */
async function main() {
  // Ordem importa: filhos antes dos pais.
  await prisma.vote.deleteMany();
  await prisma.votingOrientation.deleteMany();
  await prisma.presence.deleteMany();
  await prisma.voting.deleteMany();
  await prisma.event.deleteMany();
  await prisma.tramitacao.deleteMany();
  await prisma.tipoTramitacao.deleteMany();
  await prisma.propositionAuthor.deleteMany();
  await prisma.propositionRelation.deleteMany();
  await prisma.temaProposicao.deleteMany();
  await prisma.proposition.deleteMany();
  await prisma.tema.deleteMany();
  await prisma.propositionType.deleteMany();
  await prisma.amendmentDocument.deleteMany();
  await prisma.amendmentParliamentarian.deleteMany();
  await prisma.amendment.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.socialNetwork.deleteMany();
  await prisma.orgaoMembership.deleteMany();
  await prisma.mandateTerm.deleteMany();
  await prisma.partyAffiliation.deleteMany();
  await prisma.orgao.deleteMany();
  await prisma.parliamentarian.deleteMany();
  await prisma.party.deleteMany();

  await prisma.party.createMany({
    data: [
      { apiId: '36844', acronym: 'PT', name: 'Partido dos Trabalhadores' },
      { apiId: '36832', acronym: 'PSB', name: 'Partido Socialista Brasileiro' },
      { apiId: '36786', acronym: 'MDB', name: 'Movimento Democratico Brasileiro' },
    ],
  });

  // --- Orgaos: um plenario por casa + uma comissao permanente ---------------
  const plenarioCamara = await prisma.orgao.create({
    data: { idApi: '180', sigla: 'PLEN', nome: 'Plenario da Camara dos Deputados', casa: 'Camara', tipoOrgao: 'Plenario' },
  });

  const plenarioSenado = await prisma.orgao.create({
    data: { idApi: '1998', sigla: 'PLEN-SF', nome: 'Plenario do Senado Federal', casa: 'Senado', tipoOrgao: 'Plenario' },
  });

  const comissaoCCJ = await prisma.orgao.create({
    data: { idApi: '2003', sigla: 'CCJC', nome: 'Comissao de Constituicao e Justica e de Cidadania', casa: 'Camara', tipoOrgao: 'Comissao Permanente' },
  });

  // --- Parlamentares --------------------------------------------------------
  const deputado = await prisma.parliamentarian.create({
    data: {
      apiId: '1001',
      role: 'Deputado(a)',
      civilName: 'Joao Carlos da Silva',
      ballotName: 'Joao da Silva',
      currentParty: 'PT',
      state: 'SP',
      photoUrl: 'https://example.com/photos/joao-da-silva.jpg',
      birthDate: new Date('1980-05-10'),
      email: 'joao.silva@camara.leg.br',
      phone: '(61) 3215-1001',
      officeAddress: 'Anexo IV, Gabinete 101',
      mandateCondition: 'Titular',
      socialNetworks: {
        create: [
          { platform: 'Instagram', url: 'https://instagram.com/joaodasilva' },
          { platform: 'X', url: 'https://x.com/joaodasilva' },
        ],
      },
      expenses: {
        create: [
          { apiId: 'desp-1001-1', expenseDate: new Date('2024-01-15'), amount: 1200.5, supplierName: 'Companhia Aerea Brasil', supplierDocument: '12.345.678/0001-90', invoiceUrl: 'https://example.com/invoices/expense-1.pdf', category: 'Emissao de Bilhete Aereo' },
          { apiId: 'desp-1001-2', expenseDate: new Date('2024-02-10'), amount: 850.0, supplierName: 'Hotel Brasilia', supplierDocument: '98.765.432/0001-10', invoiceUrl: 'https://example.com/invoices/expense-2.pdf', category: 'Hospedagem' },
          { apiId: 'desp-1001-3', expenseDate: new Date('2024-03-20'), amount: 430.75, supplierName: 'Grafica Nacional', supplierDocument: '11.222.333/0001-44', invoiceUrl: 'https://example.com/invoices/expense-3.pdf', category: 'Divulgacao da Atividade Parlamentar' },
        ],
      },
      // Trocou de partido no meio do mandato: o alinhamento precisa usar o
      // partido da data da votacao, nao o `currentParty`.
      partyAffiliations: {
        create: [
          { party: 'PSB', startDate: new Date('2023-02-01'), endDate: new Date('2024-03-17') },
          { party: 'PT', startDate: new Date('2024-03-18'), endDate: null },
        ],
      },
      mandateTerms: {
        create: [{ startDate: new Date('2023-02-01'), endDate: null, description: 'Titular' }],
      },
      orgaoMemberships: {
        create: [{ orgaoId: comissaoCCJ.idOrgao, role: 'Titular' }],
      },
    },
  });

  const deputada = await prisma.parliamentarian.create({
    data: {
      apiId: '1002',
      role: 'Deputado(a)',
      civilName: 'Maria Fernanda Oliveira',
      ballotName: 'Maria Oliveira',
      currentParty: 'PSB',
      state: 'RJ',
      photoUrl: 'https://example.com/photos/maria-oliveira.jpg',
      birthDate: new Date('1985-09-22'),
      email: 'maria.oliveira@camara.leg.br',
      phone: '(61) 3215-1002',
      officeAddress: 'Anexo IV, Gabinete 202',
      mandateCondition: 'Titular',
      socialNetworks: {
        create: [
          { platform: 'Facebook', url: 'https://facebook.com/mariaoliveira' },
          { platform: 'Instagram', url: 'https://instagram.com/mariaoliveira' },
        ],
      },
      expenses: {
        create: [
          { apiId: 'desp-1002-1', expenseDate: new Date('2024-01-05'), amount: 300.0, supplierName: 'Posto Central', supplierDocument: '22.333.444/0001-55', invoiceUrl: 'https://example.com/invoices/expense-4.pdf', category: 'Combustiveis e Lubrificantes' },
          { apiId: 'desp-1002-2', expenseDate: new Date('2024-03-01'), amount: 980.9, supplierName: 'Agencia de Comunicacao BR', supplierDocument: '55.444.333/0001-22', invoiceUrl: 'https://example.com/invoices/expense-5.pdf', category: 'Divulgacao da Atividade Parlamentar' },
        ],
      },
      partyAffiliations: {
        create: [{ party: 'PSB', startDate: new Date('2023-02-01'), endDate: null }],
      },
      mandateTerms: {
        create: [{ startDate: new Date('2023-02-01'), endDate: null, description: 'Titular' }],
      },
      orgaoMemberships: {
        create: [{ orgaoId: comissaoCCJ.idOrgao, role: 'Presidente' }],
      },
    },
  });

  // Suplente que assumiu em 2025: eventos anteriores a posse NAO podem contar
  // como falta. Mesmo apiId de um deputado seria valido (unique e por
  // (idApi, cargo)) — aqui usamos um id proprio para ficar legivel.
  const senador = await prisma.parliamentarian.create({
    data: {
      apiId: '5001',
      role: 'Senador(a)',
      civilName: 'Antonio Ribeiro Nunes',
      ballotName: 'Antonio Nunes',
      currentParty: 'MDB',
      state: 'BA',
      photoUrl: 'https://example.com/photos/antonio-nunes.jpg',
      birthDate: new Date('1970-11-02'),
      email: 'antonio.nunes@senado.leg.br',
      phone: '(61) 3303-5001',
      officeAddress: 'Anexo II, Ala Teotonio Vilela, Gabinete 12',
      mandateCondition: 'Suplente em exercicio',
      partyAffiliations: {
        create: [{ party: 'MDB', startDate: new Date('2025-02-01'), endDate: null }],
      },
      mandateTerms: {
        create: [{ startDate: new Date('2025-02-01'), endDate: null, description: 'Suplente em exercicio' }],
      },
    },
  });

  // --- Temas e proposicoes --------------------------------------------------
  const temaTransparencia = await prisma.tema.create({
    data: { codigoExterno: 62, casa: 'Camara', descricao: 'Administracao Publica', nivel: 'UNICO' },
  });
  const temaCidadania = await prisma.tema.create({
    data: { codigoExterno: 48, casa: 'Camara', descricao: 'Direitos Humanos e Minorias', nivel: 'UNICO' },
  });

  const tipoPL = await prisma.propositionType.create({
    data: { sigla: 'PL', nome: 'Projeto de Lei', casa: 'Camara' },
  });
  const tipoPEC = await prisma.propositionType.create({
    data: { sigla: 'PEC', nome: 'Proposta de Emenda a Constituicao', casa: 'Camara' },
  });
  const tipoPLS = await prisma.propositionType.create({
    data: { sigla: 'PL', nome: 'Projeto de Lei', casa: 'Senado' },
  });

  const plCamara = await prisma.proposition.create({
    data: {
      apiId: '2001',
      house: 'Camara',
      typeId: tipoPL.id,
      number: '1234',
      year: 2024,
      summary: 'Dispoe sobre incentivo a transparencia publica digital.',
      currentStatus: 'Em tramitacao',
      presentationDate: new Date('2024-02-01T10:00:00'),
      // Dois temas de proposito: esta proposicao conta uma vez em CADA tema,
      // entao a soma por tema fica maior que o total de proposicoes.
      temaProposicao: {
        create: [
          { idTema: temaTransparencia.idTema },
          { idTema: temaCidadania.idTema },
        ],
      },
    },
  });

  const pecCamara = await prisma.proposition.create({
    data: {
      apiId: '2002',
      house: 'Camara',
      typeId: tipoPEC.id,
      number: '45',
      year: 2024,
      summary: 'Altera dispositivos sobre participacao cidada em processos legislativos.',
      currentStatus: 'Aguardando parecer',
      presentationDate: new Date('2024-02-14T15:30:00'),
      temaProposicao: { create: [{ idTema: temaCidadania.idTema }] },
    },
  });

  // Mesma materia na outra casa — alimenta a "jornada bicameral".
  const plSenado = await prisma.proposition.create({
    data: {
      apiId: '9001',
      house: 'Senado',
      typeId: tipoPLS.id,
      number: '1234',
      year: 2024,
      summary: 'Dispoe sobre incentivo a transparencia publica digital.',
      currentStatus: 'Pronta para a pauta',
      presentationDate: new Date('2024-05-02T09:00:00'),
    },
  });

  await prisma.propositionRelation.createMany({
    data: [
      { propositionId: plCamara.id, relatedId: plSenado.id, relationType: 'MESMA_MATERIA' },
      { propositionId: plSenado.id, relatedId: plCamara.id, relationType: 'MESMA_MATERIA' },
      { propositionId: pecCamara.id, relatedId: plCamara.id, relationType: 'PRINCIPAL' },
    ],
  });

  await prisma.propositionAuthor.createMany({
    data: [
      { parliamentarianId: deputado.id, propositionId: plCamara.id },
      { parliamentarianId: deputada.id, propositionId: plCamara.id },
      { parliamentarianId: deputada.id, propositionId: pecCamara.id },
    ],
  });

  // --- Tramitacao -----------------------------------------------------------
  const regimePrioridade = await prisma.tipoTramitacao.create({
    data: { idApi: '100', descricao: 'Recebimento pela Comissao', regime: 'Prioridade' },
  });
  const regimeUrgencia = await prisma.tipoTramitacao.create({
    data: { idApi: '200', descricao: 'Aprovacao de requerimento de urgencia', regime: 'Urgencia' },
  });

  await prisma.tramitacao.createMany({
    data: [
      {
        idApi: 'tr-2001',
        idProposicao: plCamara.id,
        sequencia: 1,
        dataHora: new Date('2024-02-01T10:00:00'),
        descricaoTramitacao: 'Apresentacao do Projeto de Lei',
        descricaoSituacao: 'Aguardando despacho do Presidente',
        despacho: 'As Comissoes de Constituicao e Justica e de Cidadania.',
        idOrgao: plenarioCamara.idOrgao,
        idTipoTramitacao: regimePrioridade.idTipoTramitacao,
      },
      {
        idApi: 'tr-2001',
        idProposicao: plCamara.id,
        sequencia: 2,
        dataHora: new Date('2024-02-20T14:30:00'),
        descricaoTramitacao: 'Recebimento pela CCJC',
        descricaoSituacao: 'Aguardando designacao de relator',
        despacho: null,
        idOrgao: comissaoCCJ.idOrgao,
        idTipoTramitacao: regimePrioridade.idTipoTramitacao,
      },
      {
        idApi: 'tr-2001',
        idProposicao: plCamara.id,
        sequencia: 3,
        dataHora: new Date('2024-03-14T09:00:00'),
        descricaoTramitacao: 'Aprovado requerimento de urgencia',
        descricaoSituacao: 'Pronta para a Ordem do Dia',
        despacho: null,
        // Sem orgao e sem tipo de proposito: o ETL nem sempre resolve os dois,
        // e a etapa tem de aparecer assim mesmo, com os campos nulos.
        idOrgao: null,
        idTipoTramitacao: null,
      },
      {
        idApi: 'tr-2002',
        idProposicao: pecCamara.id,
        sequencia: 1,
        dataHora: new Date('2024-02-14T15:30:00'),
        descricaoTramitacao: 'Apresentacao da Proposta de Emenda a Constituicao',
        descricaoSituacao: 'Aguardando parecer',
        despacho: null,
        idOrgao: plenarioCamara.idOrgao,
        idTipoTramitacao: regimeUrgencia.idTipoTramitacao,
      },
    ],
  });

  // --- Eventos --------------------------------------------------------------
  const sessaoDeliberativaCamara = await prisma.event.create({
    data: { apiId: 'ev-1', house: 'Camara', idOrgao: plenarioCamara.idOrgao, dataHoraInicio: new Date('2024-03-15T14:00:00'), descricaoTipo: 'Sessao Deliberativa' },
  });

  const sessaoSolene = await prisma.event.create({
    data: { apiId: 'ev-2', house: 'Camara', idOrgao: plenarioCamara.idOrgao, dataHoraInicio: new Date('2024-03-18T10:00:00'), descricaoTipo: 'Sessao Nao Deliberativa Solene' },
  });

  const reuniaoComissao = await prisma.event.create({
    data: { apiId: 'ev-3', house: 'Camara', idOrgao: comissaoCCJ.idOrgao, dataHoraInicio: new Date('2024-03-19T09:30:00'), descricaoTipo: 'Reuniao Deliberativa' },
  });

  const sessaoSenado2025 = await prisma.event.create({
    data: { apiId: 'ev-4', house: 'Senado', idOrgao: plenarioSenado.idOrgao, dataHoraInicio: new Date('2025-03-11T16:00:00'), descricaoTipo: 'Sessao Deliberativa' },
  });

  // Anterior a posse do senador (2025-02-01): tem de ficar fora do denominador.
  const sessaoSenado2023 = await prisma.event.create({
    data: { apiId: 'ev-5', house: 'Senado', idOrgao: plenarioSenado.idOrgao, dataHoraInicio: new Date('2023-08-22T16:00:00'), descricaoTipo: 'Sessao Deliberativa' },
  });

  await prisma.presence.createMany({
    data: [
      { parliamentarianId: deputado.id, eventId: sessaoDeliberativaCamara.id, status: 'PRESENTE' },
      { parliamentarianId: deputado.id, eventId: sessaoSolene.id, status: 'AUSENTE' },
      { parliamentarianId: deputado.id, eventId: reuniaoComissao.id, status: 'AUSENTE' },
      { parliamentarianId: deputada.id, eventId: sessaoDeliberativaCamara.id, status: 'JUSTIFICADA', justificativa: 'Missao oficial' },
      { parliamentarianId: deputada.id, eventId: reuniaoComissao.id, status: 'PRESENTE' },
      { parliamentarianId: senador.id, eventId: sessaoSenado2025.id, status: 'PRESENTE' },
      { parliamentarianId: senador.id, eventId: sessaoSenado2023.id, status: 'AUSENTE' },
    ],
  });

  // --- Votacoes, orientacoes e votos ---------------------------------------
  const votacaoPL = await prisma.voting.create({
    data: {
      apiId: '3001',
      casa: 'Camara',
      propositionId: plCamara.id,
      idOrgao: plenarioCamara.idOrgao,
      eventId: sessaoDeliberativaCamara.id,
      votingDate: new Date('2024-03-15T18:00:00'),
      subjectSummary: 'Votacao do PL 1234/2024 sobre transparencia publica digital.',
      finalResult: 'Aprovado',
      votingType: 'NOMINAL',
      orientations: {
        create: [
          { bench: 'PSB', orientation: 'Sim' },
          { bench: 'PT', orientation: 'Sim' },
          { bench: 'Governo', orientation: 'Sim' },
        ],
      },
    },
  });

  const votacaoPEC = await prisma.voting.create({
    data: {
      apiId: '3002',
      casa: 'Camara',
      propositionId: pecCamara.id,
      idOrgao: plenarioCamara.idOrgao,
      votingDate: new Date('2024-03-20T19:00:00'),
      subjectSummary: 'Votacao da PEC 45/2024 sobre participacao cidada.',
      finalResult: 'Rejeitado',
      votingType: 'NOMINAL',
      orientations: {
        create: [
          // "Liberado" nao e orientacao: sai do denominador do alinhamento.
          { bench: 'PT', orientation: 'Liberado' },
          { bench: 'PSB', orientation: 'Nao' },
        ],
      },
    },
  });

  const votacaoSenado = await prisma.voting.create({
    data: {
      apiId: '3003',
      casa: 'Senado',
      propositionId: plSenado.id,
      idOrgao: plenarioSenado.idOrgao,
      eventId: sessaoSenado2025.id,
      votingDate: new Date('2025-03-11T18:30:00'),
      subjectSummary: 'Votacao do PL 1234/2024 no Senado.',
      finalResult: 'Aprovado',
      votingType: 'NOMINAL',
    },
  });

  // Requerimento: `idProposicao` nulo. O voto existe, mas nao classifica por
  // tema — tem de aparecer em `excluidos`, nao sumir em silencio.
  const votacaoRequerimento = await prisma.voting.create({
    data: {
      apiId: '3004',
      casa: 'Camara',
      idOrgao: plenarioCamara.idOrgao,
      votingDate: new Date('2024-04-02T15:00:00'),
      subjectSummary: 'Requerimento de urgencia.',
      finalResult: 'Aprovado',
      votingType: 'SIMBOLICA',
    },
  });

  await prisma.vote.createMany({
    data: [
      // Deputado estava no PSB em 15/03/2024 e a bancada orientou "Sim": seguiu.
      { idApi: 'v-3001-1001', parliamentarianId: deputado.id, votingId: votacaoPL.id, choice: 'SIM' },
      { idApi: 'v-3001-1002', parliamentarianId: deputada.id, votingId: votacaoPL.id, choice: 'SIM' },
      // OBSTRUCAO e NAO_REGISTRADO: valores que o enum antigo do Prisma nao
      // conhecia e que derrubavam a leitura da votacao inteira.
      { idApi: 'v-3002-1001', parliamentarianId: deputado.id, votingId: votacaoPEC.id, choice: 'OBSTRUCAO' },
      { idApi: 'v-3002-1002', parliamentarianId: deputada.id, votingId: votacaoPEC.id, choice: 'NAO_REGISTRADO' },
      { idApi: 'v-3003-5001', parliamentarianId: senador.id, votingId: votacaoSenado.id, choice: 'SIM' },
      { idApi: 'v-3004-1001', parliamentarianId: deputado.id, votingId: votacaoRequerimento.id, choice: 'SIM' },
      { idApi: 'v-3004-1002', parliamentarianId: deputada.id, votingId: votacaoRequerimento.id, choice: 'NAO' },
    ],
  });

  // --- Emendas --------------------------------------------------------------
  const emenda1 = await prisma.amendment.create({
    data: {
      code: '202400010001',
      year: 2024,
      amendmentType: 'Emenda Individual',
      author: '1001',
      authorName: 'Joao da Silva',
      amendmentNumber: '0001',
      spendingLocation: 'Sao Paulo (SP)',
      functionName: 'Saude',
      subfunctionName: 'Atencao Basica',
      committedAmount: 1500000,
      liquidatedAmount: 900000,
      paidAmount: 750000,
      remainderRegistered: 0,
      remainderCanceled: 0,
      remainderPaid: 0,
      documents: {
        create: [
          { apiId: 'doc-1', amendmentCode: '202400010001', date: new Date('2024-06-10'), phase: 'Empenho', documentCode: '2024NE000123', shortDocumentCode: 'NE000123', speciesType: 'Nota de Empenho', amendmentType: 'Emenda Individual' },
          { apiId: 'doc-2', amendmentCode: '202400010001', date: new Date('2024-08-01'), phase: 'Pagamento', documentCode: '2024OB000456', shortDocumentCode: 'OB000456', speciesType: 'Ordem Bancaria', amendmentType: 'Emenda Individual' },
        ],
      },
      parliamentarianLinks: {
        create: [{ amendmentCode: '202400010001', parliamentarianId: deputado.id, authorNamePortal: 'JOAO DA SILVA', normalizedAuthorName: 'joao da silva', linkMethod: 'nome_normalizado', confidence: 95.0 }],
      },
    },
  });

  await prisma.amendment.create({
    data: {
      code: '202400020002',
      year: 2024,
      amendmentType: 'Emenda de Bancada',
      author: 'BANCADA-RJ',
      authorName: 'Bancada do Rio de Janeiro',
      amendmentNumber: '0002',
      spendingLocation: 'Rio de Janeiro (RJ)',
      functionName: 'Educacao',
      subfunctionName: 'Ensino Fundamental',
      committedAmount: 4200000,
      liquidatedAmount: 2100000,
      paidAmount: 2100000,
      // Sem vinculo a parlamentar: entra no total nacional, fica fora do ranking.
    },
  });

  await prisma.amendment.create({
    data: {
      code: '202400030003',
      year: 2023,
      amendmentType: 'Emenda Individual',
      author: '1002',
      authorName: 'Maria Oliveira',
      amendmentNumber: '0003',
      spendingLocation: 'Rio de Janeiro (RJ)',
      functionName: 'Saneamento',
      subfunctionName: 'Saneamento Basico Urbano',
      committedAmount: 800000,
      liquidatedAmount: 800000,
      paidAmount: 400000,
      parliamentarianLinks: {
        create: [{ amendmentCode: '202400030003', parliamentarianId: deputada.id, authorNamePortal: 'MARIA OLIVEIRA', normalizedAuthorName: 'maria oliveira', linkMethod: 'nome_normalizado', confidence: 88.5 }],
      },
    },
  });

  console.log('Seed executada com sucesso.');
  console.log(`  tramitacoes:   4 (3 na proposicao ${plCamara.id}, uma delas sem orgao/regime)`);
  console.log(`  parlamentares: ${deputado.id}, ${deputada.id}, ${senador.id} (senador empossado em 2025)`);
  console.log(`  proposicoes:   ${plCamara.id} (Camara), ${plSenado.id} (Senado, mesma materia)`);
  console.log(`  votacoes:      ${votacaoPL.id}, ${votacaoPEC.id} (com OBSTRUCAO e NAO REGISTRADO), ${votacaoSenado.id}`);
  console.log(`  emendas:       ${emenda1.id} e outras 2`);
}

main()
  .catch((error) => {
    console.error('Erro ao executar seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
