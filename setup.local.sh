#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}>>> Setup local do backend Voto Vivo${NC}"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}>>> Node.js não encontrado.${NC}"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo -e "${RED}>>> npm não encontrado.${NC}"
  exit 1
fi

if ! command -v mysql >/dev/null 2>&1; then
  echo -e "${RED}>>> MySQL client não encontrado.${NC}"
  echo -e "${YELLOW}>>> Instale o MySQL Server/Client e crie o banco votovivo.${NC}"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo -e "${YELLOW}>>> Arquivo .env não encontrado. Criando .env padrão...${NC}"
  cat > .env <<EOF
DATABASE_URL="mysql://root@localhost:3306/votovivo"
PORT=3001
EOF
fi

echo -e "${GREEN}>>> Instalando dependências...${NC}"
npm install

echo -e "${GREEN}>>> Garantindo que o banco exista...${NC}"
mysql -u root -e "CREATE DATABASE IF NOT EXISTS votovivo;"

echo -e "${GREEN}>>> Gerando cliente Prisma...${NC}"
npx prisma generate

echo -e "${GREEN}>>> Aplicando schema...${NC}"
npx prisma db push

echo -e "${GREEN}>>> Populando banco com mocks...${NC}"
npx prisma db seed

echo -e "${GREEN}>>> Setup concluído.${NC}"
echo -e "${GREEN}>>> Para iniciar a API:${NC} npm run dev"
echo -e "${GREEN}>>> Swagger:${NC} http://localhost:3001/api-docs"
