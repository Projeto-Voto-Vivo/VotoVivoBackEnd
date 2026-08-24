/**
 * Prova que os recortes de `GET /parlamentares/:id/emendas/resumo` fecham a
 * conta no banco.
 *
 * Tres coisas que so um MySQL real responde:
 *
 *  - **a soma bate.** `porFuncao` + `empenhadoSemFuncao` tem de dar exatamente
 *    `totalEmpenhado`, e o mesmo para localidade. E a checagem que o painel faz
 *    na tela; se ela falhar, o usuario ve uma diferenca sem explicacao e nao
 *    distingue bug de lacuna da fonte;
 *  - **centavo nao some.** Sao valores na casa dos milhoes com centavos, e a
 *    soma passa pelo driver. Em ponto flutuante o erro aparece na terceira casa
 *    e ninguem acusa;
 *  - **a collation agrupa localidade sem acento e sem caixa.** "sao paulo - sp"
 *    e "SÃO PAULO - SP" caem no mesmo balde porque a coluna e
 *    `utf8mb4_unicode_ci` — o que resolve variacao de grafia da fonte sem
 *    unificar municipios homonimos, que continuam separados pelo estado.
 *
 * Uso: bash scripts/verifica-resumo-emendas.sh   (exige Docker)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { ParliamentarianService } from '../src/services/parliamentarian.service';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

type Emenda = {
  code: string;
  funcao: string | null;
  localidade: string | null;
  empenhado: string;
  pago: string;
  restoInscrito?: string;
  vinculada?: boolean;
};

const EMENDAS: Emenda[] = [
  { code: 'A1', funcao: 'Saúde', localidade: 'SÃO PAULO - SP', empenhado: '10000000.01', pago: '5000000.00', restoInscrito: '4100000.00' },
  // Mesma cidade, sem acento e em caixa baixa: a collation junta com a A1.
  { code: 'A2', funcao: 'Saúde', localidade: 'sao paulo - sp', empenhado: '20000000.02', pago: '1000000.00' },
  { code: 'A3', funcao: 'Educação', localidade: 'CAMPINAS - SP', empenhado: '9800000.00', pago: '6100000.00' },
  // Sem funcao: sai de `porFuncao` e e declarada no metadata.
  { code: 'A4', funcao: null, localidade: 'CAMPINAS - SP', empenhado: '4100000.00', pago: '0.00' },
  // Localidade vazia — o outro jeito de a fonte nao informar.
  { code: 'A5', funcao: 'Saúde', localidade: '', empenhado: '900000.00', pago: '0.00' },
  // De outro parlamentar: nao pode aparecer em lugar nenhum.
  { code: 'A6', funcao: 'Saúde', localidade: 'SÃO PAULO - SP', empenhado: '99999999.00', pago: '0.00', vinculada: false },
];

type Verificacao = { o: string; obtido: unknown; esperado: unknown };

async function main() {
  await prisma.amendmentParliamentarian.deleteMany();
  await prisma.amendment.deleteMany();
  await prisma.parliamentarian.deleteMany();

  const deputado = await prisma.parliamentarian.create({
    data: { apiId: 'p-1', role: 'Deputado(a)', ballotName: 'Deputada', currentParty: 'PT' },
  });

  const outro = await prisma.parliamentarian.create({
    data: { apiId: 'p-2', role: 'Deputado(a)', ballotName: 'Outro', currentParty: 'PL' },
  });

  for (const emenda of EMENDAS) {
    const dono = emenda.vinculada === false ? outro : deputado;

    await prisma.amendment.create({
      data: {
        code: emenda.code,
        functionName: emenda.funcao,
        spendingLocation: emenda.localidade,
        committedAmount: emenda.empenhado,
        paidAmount: emenda.pago,
        remainderRegistered: emenda.restoInscrito ?? '0.00',
        parliamentarianLinks: {
          create: { amendmentCode: emenda.code, parliamentarianId: dono.id },
        },
      },
    });
  }

  const service = new ParliamentarianService(prisma);
  const r = await service.getAmendmentSummaryByParliamentarianId(deputado.id);

  const acha = <T extends { empenhado: string }>(itens: T[], chave: string, campo: keyof T) =>
    itens.find((item) => String(item[campo]).toUpperCase() === chave.toUpperCase());

  const saude = acha(r.porFuncao, 'Saúde', 'funcao');
  const educacao = acha(r.porFuncao, 'Educação', 'funcao');
  const saoPaulo = acha(r.porLocalidade, 'SÃO PAULO - SP', 'localidade');
  const campinas = acha(r.porLocalidade, 'CAMPINAS - SP', 'localidade');

  /** A conta que o painel faz na tela. */
  const fecha = (itens: { empenhado: string }[], semDado: string) =>
    itens
      .reduce((acc, item) => acc + Number(item.empenhado), Number(semDado))
      .toFixed(2);

  const verificacoes: Verificacao[] = [
    { o: 'totalEmendas', obtido: r.totalEmendas, esperado: 5 },
    { o: 'totalEmpenhado', obtido: r.totalEmpenhado, esperado: 44800000.03 },
    { o: 'totalRestoInscrito', obtido: r.totalRestoInscrito, esperado: 4100000 },

    // A1 + A2 + A5, com os centavos das duas primeiras.
    { o: 'funcao Saúde quantidade', obtido: saude?.quantidade, esperado: 3 },
    { o: 'funcao Saúde empenhado', obtido: saude?.empenhado, esperado: '30900000.03' },
    { o: 'funcao Saúde pago', obtido: saude?.pago, esperado: '6000000.00' },
    { o: 'funcao Educação', obtido: educacao?.empenhado, esperado: '9800000.00' },
    { o: 'funcao sem dado fica fora', obtido: r.porFuncao.length, esperado: 2 },
    { o: 'metadata.semFuncao', obtido: r.metadata.semFuncao, esperado: 1 },
    { o: 'metadata.empenhadoSemFuncao', obtido: r.metadata.empenhadoSemFuncao, esperado: '4100000.00' },

    // A collation junta "sao paulo - sp" com "SÃO PAULO - SP".
    { o: 'localidade SP quantidade', obtido: saoPaulo?.quantidade, esperado: 2 },
    { o: 'localidade SP empenhado', obtido: saoPaulo?.empenhado, esperado: '30000000.03' },
    { o: 'localidade Campinas', obtido: campinas?.empenhado, esperado: '13900000.00' },
    { o: 'localidade sem dado fora', obtido: r.porLocalidade.length, esperado: 2 },
    { o: 'metadata.semLocalidade', obtido: r.metadata.semLocalidade, esperado: 1 },
    { o: 'metadata.empenhadoSemLocalidade', obtido: r.metadata.empenhadoSemLocalidade, esperado: '900000.00' },

    // O que o painel precisa poder afirmar.
    { o: 'funcao fecha com o total', obtido: fecha(r.porFuncao, r.metadata.empenhadoSemFuncao), esperado: '44800000.03' },
    { o: 'localidade fecha com o total', obtido: fecha(r.porLocalidade, r.metadata.empenhadoSemLocalidade), esperado: '44800000.03' },

    // Ordenado por dinheiro: Educação tem mais emendas que ninguem? nao — o
    // criterio e o empenhado, e Saúde ganha.
    { o: 'ordem por funcao', obtido: r.porFuncao.map((i) => i.funcao).join(' | '), esperado: 'Saúde | Educação' },

    // A emenda do outro parlamentar nao pode ter vazado.
    { o: 'nao vazou emenda de outro', obtido: JSON.stringify(r).includes('99999999'), esperado: false },
  ];

  let falhas = 0;

  for (const v of verificacoes) {
    const ok = JSON.stringify(v.obtido) === JSON.stringify(v.esperado);
    if (!ok) falhas += 1;

    console.log(
      `${ok ? 'ok   ' : 'FALHA'} ${v.o.padEnd(32)}${String(v.obtido).padStart(16)}` +
        `${ok ? '' : `   esperado ${String(v.esperado)}`}`,
    );
  }

  console.log(
    `\nrotulo que o banco escolheu para a localidade repetida: "${saoPaulo?.localidade}"`,
  );

  console.log(
    falhas === 0
      ? '\nOK: os recortes fecham com o total, sem perder centavo, e o que ficou de fora esta declarado.'
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
