#!/usr/bin/env bash
# Prova que a fidelidade partidaria por tema fecha as contas no banco.
#
# O servico tem uma subquery correlacionada dentro da condicao de JOIN, sob um
# GROUP BY, atravessando cinco tabelas. Mock de $queryRaw prova a dobra em
# TypeScript e nada sobre o SQL.
#
# O que nao pode voltar: a soma dos temas bater com o total. Ela e MAIOR de
# proposito — uma proposicao com dois temas faz o voto contar nos dois.
#
# Uso: bash scripts/verifica-filtros-votacoes.sh   (exige Docker)

set -euo pipefail

SCHEMA_SQL="${1:-../VotoVivoDataAggregator/popular/schema.sql}"
CONTAINER="votovivo_filtros_check"
PORT="${FILTROS_CHECK_PORT:-3395}"
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

echo "==> Verificando os filtros de votacoes..."
DATABASE_URL="$DB_URL" npx tsx scripts/verifica-filtros-votacoes.ts
