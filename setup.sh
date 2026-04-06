#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

WITH_FRONTEND=false

if [[ "$1" == "--with-frontend" ]]; then
  WITH_FRONTEND=true
fi

echo -e "${GREEN}>>> Iniciando ambiente Voto Vivo com Docker...${NC}"

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}>>> Docker não encontrado. Instale o Docker primeiro.${NC}"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo -e "${RED}>>> Docker Compose não encontrado.${NC}"
  exit 1
fi

echo -e "${GREEN}>>> Subindo banco de dados...${NC}"
$COMPOSE_CMD up -d mysql_db

echo -e "${YELLOW}>>> Aguardando MySQL ficar saudável...${NC}"
MAX_RETRIES=30
COUNT=0

while [ $COUNT -lt $MAX_RETRIES ]; do
  if docker exec votovivo_db mysqladmin ping -h localhost -u root --silent; then
    echo -e "${GREEN}>>> MySQL está pronto.${NC}"
    break
  fi

  COUNT=$((COUNT+1))
  sleep 2
done

if [ $COUNT -eq $MAX_RETRIES ]; then
  echo -e "${RED}>>> MySQL não iniciou a tempo.${NC}"
  $COMPOSE_CMD logs mysql_db
  exit 1
fi

echo -e "${GREEN}>>> Subindo API...${NC}"
$COMPOSE_CMD up -d --build api

if [ "$WITH_FRONTEND" = true ]; then
  echo -e "${GREEN}>>> Subindo Frontend...${NC}"
  $COMPOSE_CMD up -d --build frontend
fi

echo -e "${GREEN}>>> Ambiente iniciado com sucesso.${NC}"
echo -e "${GREEN}>>> API: http://localhost:3001${NC}"
echo -e "${GREEN}>>> Swagger: http://localhost:3001/api-docs${NC}"

if [ "$WITH_FRONTEND" = true ]; then
  echo -e "${GREEN}>>> Frontend: http://localhost:3000${NC}"
fi
