#!/usr/bin/env bash
# Prova o ranking de afinidade contra o banco.
#
# O unitario prova a matematica com $queryRaw mockado, e nada sobre o SQL. Aqui
# se prova que COUNT(DISTINCT) nao duplica proposicao com dois temas, que a
# comparacao ignora acento, e que o filtro de pool muda o denominador.
#
# Uso: bash scripts/verifica-ranking.sh   (exige Docker)

set -euo pipefail

SCHEMA_SQL="${1:-../VotoVivoDataAggregator/popular/schema.sql}"
CONTAINER="votovivo_ranking_check"
PORT="${RANKING_CHECK_PORT:-3393}"
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

echo "==> Verificando o ranking de afinidade..."
DATABASE_URL="$DB_URL" npx tsx scripts/verifica-ranking.ts
