import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { router } from './routes';
import { errorHandler } from './middlewares/error-handler';

const app = express();
const swaggerDocument = yaml.load(fs.readFileSync(path.join(__dirname, '../swagger.yaml'), 'utf8')) as Record<string, unknown>;

app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(router);

app.get('/', (_req, res) => {
  res.status(200).json({ message: 'Voto Vivo API operante', docs: '/api-docs' });
});

app.use(errorHandler);

export default app;
