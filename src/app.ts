import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { router } from './routes';
import { errorHandler } from './middlewares/error-handler';
import { rateLimit } from './middlewares/rate-limit';

const app = express();
const swaggerDocument = yaml.load(fs.readFileSync(path.join(__dirname, '../swagger.yaml'), 'utf8')) as Record<string, unknown>;

// Pre-requisito do rate limit: atras do nginx (que envia X-Forwarded-For),
// sem isto `req.ip` seria o IP do proxy e o limite viraria global.
app.set('trust proxy', 1);

// A API e somente-leitura: o banco e alimentado exclusivamente pelo ETL.
// Sem `express.json()` — nao ha corpo de requisicao a interpretar.

// Dados publicos, somente-leitura: por padrao qualquer origem pode consumir.
//
// CORS nao e um controle de acesso — ele so limita o que paginas web conseguem
// ler no navegador. curl, backends, apps e scrapers o ignoram por completo.
// Restringir origem aqui nao protegeria dado nenhum; o que efetivamente segura
// abuso e o rate limit por IP (nginx + `rateLimit()` abaixo).
//
// `CORS_ORIGINS` continua disponivel como restricao opcional: quando definida,
// vale a lista; vazia ou ausente, libera todas as origens.
const origensPermitidas = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origem) => origem.trim())
  .filter(Boolean);

app.use(cors({
  origin: origensPermitidas.length > 0 ? origensPermitidas : '*',
  methods: ['GET'],
}));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// O Swagger UI vem antes do rate limit de proposito: sao ~15 assets estaticos
// por carregamento e consumiriam a cota de um usuario legitimo.
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(rateLimit());
app.use(router);

app.get('/', (_req, res) => {
  res.status(200).json({ message: 'Voto Vivo API operante', docs: '/api-docs' });
});

app.use(errorHandler);

export default app;
