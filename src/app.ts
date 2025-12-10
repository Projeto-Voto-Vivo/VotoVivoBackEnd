import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yamljs';
import path from 'path';
import { router } from './routes';

const app = express();
const swaggerDocument = yaml.load(path.join(__dirname, '../swagger.yaml'));

app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(router);

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Voto Vivo API operante', docs: '/api-docs' });
});

export default app;
