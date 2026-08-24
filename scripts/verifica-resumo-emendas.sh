#!/usr/bin/env bash
# Prova que os recortes de GET /parlamentares/:id/emendas/resumo fecham a conta.
#
# porFuncao + empenhadoSemFuncao tem de dar exatamente totalEmpenhado — e a
# checagem que o painel faz na tela. Centavo em soma de milhoes e collation
# insensivel a acento nao existem num mock.
#
# Uso: bash scripts/verifica-resumo-emendas.sh   (exige Docker)

set -euo pipefail

SCHEMA_SQL="${1:-../VotoVivoDataAggregator/popular/schema.sql}"
CONTAINER="votovivo_emendas_check"
PORT="${EMENDAS_CHECK_PORT:-3394}"
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

echo "==> Verificando o resumo de emendas..."
DATABASE_URL="$DB_URL" npx tsx scripts/verifica-resumo-emendas.ts
