#!/usr/bin/env bash
# Prova que a regra de pertencimento de bancada funciona no banco.
#
# O AlignmentService decide, em SQL, se uma bancada representa o partido do
# parlamentar, lendo a resolucao que o ETL gravou em orientacaoVotacao
# (siglaPartido / idBloco) e a composicao em blocoPartido. Nada disso existe
# num mock: o EXISTS correlacionado so se prova contra um MySQL real.
#
# O bug que isto impede de voltar: com igualdade exata contra o NOME da
# bancada, todo deputado de federacao ("Fdr PT-PCdoB-PV") ficava com zero
# comparacoes — 19% da Camara. Parsear o nome resolvia federacao mas nunca
# bloco ("Bl UniPpPsd..." vem abreviado e truncado).
#
# Uso: bash scripts/verifica-bancada.sh   (exige Docker)

set -euo pipefail

SCHEMA_SQL="${1:-../VotoVivoDataAggregator/popular/schema.sql}"
CONTAINER="votovivo_bancada_check"
PORT="${BANCADA_CHECK_PORT:-3397}"
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

echo "==> Verificando a resolucao de bancada..."
DATABASE_URL="$DB_URL" npx tsx scripts/verifica-bancada.ts
