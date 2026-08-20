import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// O composition root dos routers instancia o PrismaClient no import. O adapter
// exige uma URL, mesmo que nenhuma query seja executada neste teste.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'mysql://root:test@127.0.0.1:3306/votovivo';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router } = require('./routes') as { router: any };

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: Layer[] };
};

/** `/parlamentares/:id/perfil` -> `/parlamentares/{id}/perfil` */
const paraOpenApi = (caminho: string) =>
  caminho.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

function coletarRotas(stack: Layer[], acumulador: Set<string>): Set<string> {
  for (const layer of stack) {
    if (layer.route) {
      for (const metodo of Object.keys(layer.route.methods)) {
        acumulador.add(`${metodo.toUpperCase()} ${paraOpenApi(layer.route.path)}`);
      }
      continue;
    }

    if (layer.handle?.stack) {
      coletarRotas(layer.handle.stack, acumulador);
    }
  }

  return acumulador;
}

describe('contrato do swagger', () => {
  const documento = yaml.load(
    fs.readFileSync(path.join(__dirname, '../swagger.yaml'), 'utf8'),
  ) as { paths: Record<string, Record<string, unknown>> };

  const documentadas = new Set<string>();
  for (const [caminho, operacoes] of Object.entries(documento.paths)) {
    for (const metodo of Object.keys(operacoes)) {
      documentadas.add(`${metodo.toUpperCase()} ${caminho}`);
    }
  }

  const registradas = coletarRotas(router.stack as Layer[], new Set<string>());

  /**
   * Antes, apenas 12 de ~22 rotas estavam no swagger. Este teste e o que
   * impede a documentacao de divergir de novo em silencio.
   */
  it('should document every registered route', () => {
    const semDocumentacao = [...registradas].filter(
      (rota) => !documentadas.has(rota),
    );

    expect(semDocumentacao).toEqual([]);
  });

  it('should not document routes that do not exist', () => {
    const semImplementacao = [...documentadas].filter(
      (rota) => !registradas.has(rota),
    );

    expect(semImplementacao).toEqual([]);
  });

  /**
   * A API e somente-leitura: o banco e alimentado exclusivamente pelo ETL.
   * Qualquer rota de escrita aqui e uma regressao de seguranca.
   */
  it('should expose read-only routes only', () => {
    const escrita = [...registradas].filter(
      (rota) => !rota.startsWith('GET ') && !rota.startsWith('HEAD '),
    );

    expect(escrita).toEqual([]);
  });

  it('should declare the canonical seven-value vote enum', () => {
    const componentes = (
      yaml.load(
        fs.readFileSync(path.join(__dirname, '../swagger.yaml'), 'utf8'),
      ) as any
    ).components.schemas;

    expect(componentes.VotacaoPerfil.properties.voto.enum).toEqual([
      'SIM',
      'NAO',
      'ABSTENCAO',
      'OBSTRUCAO',
      'AUSENCIA_JUSTIFICADA',
      'AUSENTE',
      'NAO_REGISTRADO',
    ]);
  });
});
