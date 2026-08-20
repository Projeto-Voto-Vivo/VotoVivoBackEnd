// Carrega o .env em desenvolvimento. Em producao as variaveis vem do compose,
// e `dotenv/config` e inofensivo quando nao ha arquivo. Sem isto, `npm run dev`
// quebrava em `process.env.DATABASE_URL!`.
import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
