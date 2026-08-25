/**
 * Prova o ranking de afinidade contra o banco.
 *
 * O `RankingService` e testado em unitario com `$queryRaw` mockado — o que
 * prova a MATEMATICA e nada sobre o SQL. Quatro coisas so um MySQL real
 * responde:
 *
 *  - as quatro agregacoes contam o que deveriam, atravessando de tres a quatro
 *    tabelas cada uma;
 *  - `COUNT(DISTINCT idProposicao)` no criterio de tema NAO multiplica quando a
 *    proposicao tem mais de um tema. Com `COUNT(*)`, quem escreve sobre assunto
 *    transversal subiria no ranking sem ter escrito mais nada;
 *  - a comparacao por igualdade ignora acento e caixa (`utf8mb4_unicode_ci`),
 *    entao o valor vindo do seletor casa mesmo com grafia diferente;
 *  - o filtro de pool muda o DENOMINADOR: com `partido=PT`, o maior valor passa
 *    a ser o maior entre petistas, e as notas de todo mundo mudam. E o
 *    comportamento declarado no payload, e o que mais confunde quem compara
 *    duas buscas.
 *
 * Uso: bash scripts/verifica-ranking.sh   (exige Docker)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { RankingService } from '../src/services/ranking.service';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const SAUDE = 'Saúde';
const EDUCACAO = 'Educação';

type Verificacao = { o: string; obtido: unknown; esperado: unknown };

async function main() {
  await prisma.amendmentParliamentarian.deleteMany();
  await prisma.amendment.deleteMany();
  await prisma.orgaoMembership.deleteMany();
  await prisma.orgao.deleteMany();
  await prisma.propositionAuthor.deleteMany();
  await prisma.temaProposicao.deleteMany();
  await prisma.tema.deleteMany();
  await prisma.proposition.deleteMany();
  await prisma.parliamentarian.deleteMany();

  const pessoa = async (nome: string, partido: string, uf: string) =>
    (await prisma.parliamentarian.create({
      data: { apiId: `p-${nome}`, role: 'Deputado(a)', ballotName: nome, currentParty: partido, state: uf },
    })).id;

  const ana = await pessoa('Ana', 'PT', 'SP');
  const bruno = await pessoa('Bruno', 'PT', 'RJ');
  const carla = await pessoa('Carla', 'PL', 'SP');
  const davi = await pessoa('Davi', 'PL', 'MG');

  const tema = async (descricao: string, codigo: number) =>
    (await prisma.tema.create({ data: { codigoExterno: codigo, casa: 'Camara', descricao } })).idTema;

  const idSaude = await tema(SAUDE, 1);
  const idEducacao = await tema(EDUCACAO, 2);

  /** `temas` com dois itens e o caso que quebraria um `COUNT(*)`. */
  const proposicao = async (apiId: string, autor: number, temas: number[]) => {
    const criada = await prisma.proposition.create({
      data: { apiId, house: 'Camara', summary: `Ementa ${apiId}` },
    });

    await prisma.propositionAuthor.create({
      data: { propositionId: criada.id, parliamentarianId: autor },
    });

    for (const idTema of temas) {
      await prisma.temaProposicao.create({ data: { idProposicao: criada.id, idTema } });
    }
  };

  // Ana: 3 proposicoes de saude, uma delas TAMBEM de educacao.
  await proposicao('PA1', ana, [idSaude]);
  await proposicao('PA2', ana, [idSaude]);
  await proposicao('PA3', ana, [idSaude, idEducacao]);
  // Bruno: 1 de saude. Carla: 1 de educacao so. Davi: nenhuma.
  await proposicao('PB1', bruno, [idSaude]);
  await proposicao('PC1', carla, [idEducacao]);

  const emenda = async (code: string, dono: number, funcao: string, destino: string, valor: string) => {
    await prisma.amendment.create({
      data: {
        code,
        functionName: funcao,
        spendingLocation: destino,
        committedAmount: valor,
        parliamentarianLinks: { create: { amendmentCode: code, parliamentarianId: dono } },
      },
    });
  };

  await emenda('E1', ana, SAUDE, 'SÃO PAULO - SP', '1000000.00');
  await emenda('E2', bruno, SAUDE, 'RIO DE JANEIRO - RJ', '4000000.00');
  await emenda('E3', carla, SAUDE, 'SÃO PAULO - SP', '3000000.00');
  await emenda('E4', davi, EDUCACAO, 'BELO HORIZONTE - MG', '9000000.00');

  const comissao = await prisma.orgao.create({
    data: { idApi: 'o-1', sigla: 'CSSF', nome: 'Comissão de Seguridade Social e Família', casa: 'Camara' },
  });

  await prisma.orgaoMembership.create({
    data: { parliamentarianId: ana, orgaoId: comissao.idOrgao, role: 'Titular' },
  });
  await prisma.orgaoMembership.create({
    data: { parliamentarianId: carla, orgaoId: comissao.idOrgao, role: 'Presidente' },
  });

  const service = new RankingService(prisma);
  const nome = (r: { data: { nomeParlamentar: string }[] }) =>
    r.data.map((item) => item.nomeParlamentar).join(' | ');

  // --- tema, sem acento no pedido
  const porTema = await service.rankParliamentarians({ tema: 'Saude' });
  const anaNoTema = porTema.data.find((i) => i.nomeParlamentar === 'Ana');

  // --- dinheiro
  const porFuncao = await service.rankParliamentarians({ funcaoEmenda: 'saude' });
  const porDestino = await service.rankParliamentarians({ destinoEmenda: 'sao paulo - sp' });

  // --- comissao por sigla e por nome
  const porSigla = await service.rankParliamentarians({ comissao: 'CSSF' });
  const porNome = await service.rankParliamentarians({
    comissao: 'Comissao de Seguridade Social e Familia',
  });

  // --- combinado, e o mesmo combinado dentro de um partido so
  const combinado = await service.rankParliamentarians({ tema: SAUDE, funcaoEmenda: SAUDE });
  const soPt = await service.rankParliamentarians({ funcaoEmenda: SAUDE, partido: 'PT' });

  const verificacoes: Verificacao[] = [
    // Ana tem 3 proposicoes de saude; a PA3 tem dois temas e nao pode contar
    // duas vezes.
    { o: 'tema: valor da Ana', obtido: anaNoTema?.criterios.tema, esperado: undefined },
    { o: 'tema: ordem', obtido: nome(porTema), esperado: 'Ana | Bruno' },
    { o: 'tema: Ana marca 100', obtido: porTema.data[0].pontuacao, esperado: 100 },
    { o: 'tema: Bruno 1 de 3', obtido: porTema.data[1].pontuacao, esperado: 33.3 },
    // Davi e Carla nao escrevem sobre saude e nao entram.
    { o: 'tema: so quem tem sinal', obtido: porTema.metadata.comAlgumSinal, esperado: 2 },
    { o: 'tema: candidatos', obtido: porTema.metadata.candidatos, esperado: 4 },

    // 4M, 3M, 1M — normalizados pelo maior (Bruno).
    { o: 'funcao: ordem', obtido: nome(porFuncao), esperado: 'Bruno | Carla | Ana' },
    { o: 'funcao: valor bruto', obtido: porFuncao.data[0].criterios.funcaoEmenda, esperado: undefined },
    { o: 'funcao: Carla 3 de 4', obtido: porFuncao.data[1].pontuacao, esperado: 75 },

    // Destino nao e UF de eleicao: Carla e Ana mandaram para SP.
    { o: 'destino: ordem', obtido: nome(porDestino), esperado: 'Carla | Ana' },

    { o: 'comissao por sigla', obtido: nome(porSigla), esperado: 'Ana | Carla' },
    { o: 'comissao por nome', obtido: nome(porNome), esperado: 'Ana | Carla' },
    { o: 'comissao e binaria', obtido: porSigla.data[1].pontuacao, esperado: 100 },

    // Ana: tema 100, emenda 25 -> 62.5. Bruno: tema 33.3, emenda 100 -> 66.7.
    { o: 'combinado: ordem', obtido: nome(combinado), esperado: 'Bruno | Ana | Carla' },
    { o: 'combinado: Bruno', obtido: combinado.data[0].pontuacao, esperado: 66.7 },
    { o: 'combinado: Ana', obtido: combinado.data[1].pontuacao, esperado: 62.5 },
    // Carla nao escreve sobre saude: criterio ausente conta zero, nao ignorado.
    { o: 'combinado: Carla 1 de 2', obtido: combinado.data[2].criteriosAtendidos, esperado: 1 },
    { o: 'combinado: Carla nota', obtido: combinado.data[2].pontuacao, esperado: 37.5 },

    // O filtro muda o DENOMINADOR: entre petistas, Bruno (4M) segue sendo o
    // teto, mas Carla (3M) sai do pool — e Ana continua 25.
    { o: 'pool filtrado: so PT', obtido: nome(soPt), esperado: 'Bruno | Ana' },
    { o: 'pool filtrado: candidatos', obtido: soPt.metadata.candidatos, esperado: 2 },
    { o: 'pool filtrado: maior valor', obtido: soPt.metadata.criterios[0].maiorValorNoPool, esperado: '4000000.00' },
  ];

  let falhas = 0;

  for (const v of verificacoes) {
    // Os dois casos de valor bruto sao comparados a parte, por serem objetos.
    if (v.esperado === undefined) {
      continue;
    }

    const ok = JSON.stringify(v.obtido) === JSON.stringify(v.esperado);
    if (!ok) falhas += 1;

    console.log(
      `${ok ? 'ok   ' : 'FALHA'} ${v.o.padEnd(30)}${String(v.obtido).padStart(22)}` +
        `${ok ? '' : `   esperado ${String(v.esperado)}`}`,
    );
  }

  const conferir = (rotulo: string, obtido: unknown, esperado: unknown) => {
    const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
    if (!ok) falhas += 1;
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${rotulo.padEnd(30)}${JSON.stringify(obtido)}`);
    if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}`);
  };

  // O ponto central: 3, e nao 4. A PA3 conta uma vez, apesar dos dois temas.
  conferir('tema: DISTINCT nao duplica', anaNoTema?.criterios.tema, {
    pedido: 'Saude',
    valor: 3,
    unidade: 'proposicoes',
    pontuacao: 100,
  });

  conferir('funcao: dinheiro como string', porFuncao.data[0].criterios.funcaoEmenda, {
    pedido: 'saude',
    valor: '4000000.00',
    unidade: 'reais_empenhados',
    pontuacao: 100,
  });

  conferir('comissao: cargo vem no detalhe', (porSigla.data[1].criterios.comissao as { detalhe?: string }).detalhe, 'Presidente');

  console.log(
    falhas === 0
      ? '\nOK: as agregacoes contam certo, acento nao atrapalha, e o filtro muda o denominador como declarado.'
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
