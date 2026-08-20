#!/usr/bin/env bash
# Verifica se prisma/schema.prisma esta 1:1 com o schema canonico do agregador
# (VotoVivoDataAggregator/popular/schema.sql).
#
# Sobe um MySQL descartavel, carrega o SQL canonico e pede o diff ao Prisma.
# Diff vazio = contrato de dados intacto. Qualquer ALTER/CREATE no output e
# divergencia que precisa ser corrigida no schema.prisma.
#
# Uso: npm run schema:check [caminho/para/schema.sql]

set -euo pipefail

SCHEMA_SQL="${1:-../VotoVivoDataAggregator/popular/schema.sql}"
CONTAINER="votovivo_schema_check"
PORT="${SCHEMA_CHECK_PORT:-3399}"
DB_URL="mysql://root:test@127.0.0.1:${PORT}/votovivo"

if [ ! -f "$SCHEMA_SQL" ]; then
  echo "ERRO: schema canonico nao encontrado em '$SCHEMA_SQL'." >&2
  echo "Clone o VotoVivoDataAggregator ao lado deste repo ou passe o caminho como argumento." >&2
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

echo "==> Comparando com prisma/schema.prisma..."
DIFF=$(DATABASE_URL="$DB_URL" npx prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --script 2>&1 \
  | grep -v "^Loaded Prisma config")

if echo "$DIFF" | grep -qi "empty migration"; then
  echo "OK: schema.prisma esta alinhado ao schema canonico (diff vazio)."
  exit 0
fi

echo "FALHA: divergencia entre schema.prisma e o schema canonico:" >&2
echo "$DIFF" >&2
exit 1
