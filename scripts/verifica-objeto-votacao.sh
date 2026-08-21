#!/usr/bin/env bash
# Prova que o classificador de objeto de votacao decide o MESMO em TypeScript e
# em SQL.
#
# A regra de `src/domain/objeto-votacao.ts` e usada de duas formas: em TS para
# preencher o campo `objeto`, e traduzida para SQL para filtrar a agregacao de
# `/parlamentares/:id/temas`. Teste unitario cobre so o lado TS — `LIKE`, a
# collation insensivel a acento e a ordem das regras nao existem num mock.
#
# Se as duas divergirem, a interface mostra uma categoria e o filtro devolve
# outra, sem erro em lugar nenhum.
#
# Uso: bash scripts/verifica-objeto-votacao.sh   (exige Docker)

set -euo pipefail

SCHEMA_SQL="${1:-../VotoVivoDataAggregator/popular/schema.sql}"
CONTAINER="votovivo_objeto_check"
PORT="${OBJETO_CHECK_PORT:-3398}"
DB_URL="mysql://root:test@127.0.0.1:${PORT}/votovivo?allowPublicKeyRetrieval=true"

if [ ! -f "$SCHEMA_SQL" ]; then
  echo "ERRO: schema canonico nao encontrado em '$SCHEMA_SQL'." >&2
  exit 1
fi

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
echo "==> Subindo MySQL descartavel na porta ${PORT}..."
docker run --rm -d --name "$CONTAINER" -e MYSQL_ROOT_PASSWORD=test -p "${PORT}:3306" mysql:8.0 >/dev/null

echo "==> Aguardando o servidor definitivo..."
for _ in $(seq 1 120); do
  if docker logs "$CONTAINER" 2>&1 | grep -q "port: 3306  MySQL Community Server"; then
    break
  fi
  sleep 1
done

echo "==> Carregando ${SCHEMA_SQL}..."
docker exec -i "$CONTAINER" mysql -uroot -ptest < "$SCHEMA_SQL" 2>&1 | grep -v "Using a password" || true

echo "==> Comparando classificacao em TypeScript e em SQL..."
DATABASE_URL="$DB_URL" npx tsx scripts/verifica-objeto-votacao.ts
