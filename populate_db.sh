#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Argumento para pular importação
SKIP_IMPORT=false
if [[ "$1" == "--start-only" || "$1" == "--no-import" ]]; then
    SKIP_IMPORT=true
    echo -e "${YELLOW}>>> MODO RÁPIDO: Apenas ativando serviços (Pulando importação de dados)${NC}"
fi

# --- Configuração do Repositório e Caminhos ---
REPO_URL="git@github.com:Projeto-Voto-Vivo/VotoVivoDataAggregator.git"
REPO_DIR="VotoVivoDataAggregator"
SCRIPTS_DIR="$REPO_DIR/popular"

# --- 1. Clone do Repositorio ---
echo -e "${GREEN}>>> Verificando repositório de dados...${NC}"

if [ ! -d "$REPO_DIR" ]; then
    echo -e "${YELLOW}>>> Diretório '$REPO_DIR' não encontrado. Clonando repositório...${NC}"
    git clone "$REPO_URL"
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}>>> Falha ao clonar o repositório. Verifique se o Git está instalado e suas chaves SSH configuradas.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}>>> Diretório do repositório já existe.${NC}"
fi

# Verifica se a pasta popular existe dentro do repo
if [ ! -d "$SCRIPTS_DIR" ]; then
    echo -e "${RED}>>> Erro: A pasta '$SCRIPTS_DIR' não foi encontrada dentro do repositório.${NC}"
    exit 1
fi

# --- 2. Infraestrutura Docker (Banco de Dados) ---
echo -e "${GREEN}>>> Iniciando o Banco de Dados...${NC}"
docker-compose up -d mysql_db

echo -e "${YELLOW}>>> Aguardando Banco de Dados estar PRONTO...${NC}"

# Loop de verificação de saúde do MySQL
MAX_RETRIES=30
COUNT=0
while [ $COUNT -lt $MAX_RETRIES ]; do
    if docker exec votovivo_db mysqladmin ping -h localhost -u root --silent; then
        echo -e "${GREEN}>>> MySQL está respondendo!${NC}"
        break
    fi
    echo -n "."
    sleep 2
    COUNT=$((COUNT+1))
done

if [ $COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}>>> Erro: MySQL não iniciou a tempo. Verifique os logs com 'docker-compose logs mysql_db'.${NC}"
    exit 1
fi

sleep 5

# --- 3. Criação de Estrutura (Schema) ---
echo -e "${GREEN}>>> Verificando/Criando Tabelas no Banco de Dados...${NC}"
docker exec -i votovivo_db mysql -u root < "$SCRIPTS_DIR/schema.sql"

if [ $? -ne 0 ]; then
    echo -e "${RED}>>> Falha ao aplicar o schema. Verifique se o arquivo schema.sql existe em $SCRIPTS_DIR.${NC}"
    exit 1
fi

# --- 4. Importação de Dados (Condicional) ---

if [ "$SKIP_IMPORT" = false ]; then
    
    echo -e "${GREEN}>>> Configurando ambiente virtual Python (venv)...${NC}"

    if [ ! -d "venv" ]; then
        echo "Criando pasta 'venv'..."
        python3 -m venv venv
    fi

    source venv/bin/activate

    echo -e "${GREEN}>>> Instalando dependências no venv...${NC}"
    pip install --upgrade pip
    pip install mysql-connector-python requests

    echo -e "${GREEN}>>> Rodando Scripts de População...${NC}"

    echo "1. Importando Deputados..."
    python "$SCRIPTS_DIR/deputado.py"

    echo "2. Importando Partidos..."
    python "$SCRIPTS_DIR/partidos.py"

    echo "3. Importando Gabinetes..."
    python "$SCRIPTS_DIR/gabinete.py"

    echo "4. Importando Histórico/Status..."
    python "$SCRIPTS_DIR/historico.py"

    echo "5. Importando Redes Sociais..."
    python "$SCRIPTS_DIR/redeSocial.py"

    echo "6. Importando Despesas (Isso pode demorar MUITO)..."
    python "$SCRIPTS_DIR/despesas.py"

    echo -e "${GREEN}>>> Desativando venv...${NC}"
    deactivate

else
    echo -e "${YELLOW}>>> Pulando importação de dados conforme solicitado (--start-only).${NC}"
fi

# --- 5. Inicialização da API com Verificação ---

echo -e "${GREEN}>>> Reconstruindo e iniciando a API...${NC}"
# Força o rebuild para garantir que as alterações no package.json sejam pegas
docker-compose up -d --build api

echo -e "${YELLOW}>>> Verificando saúde da API...${NC}"
# Aguarda um pouco para o processo node iniciar
sleep 5

# Verifica se o container ainda está rodando
if [ "$(docker inspect -f '{{.State.Running}}' votovivo_api)" = "true" ]; then
    echo -e "${GREEN}>>> Sucesso! API rodando em http://localhost:3000${NC}"
    echo -e "${GREEN}>>> Documentação Swagger em http://localhost:3000/api-docs${NC}"
else
    echo -e "${RED}>>> ERRO: O container da API iniciou mas caiu logo em seguida.${NC}"
    echo -e "${YELLOW}>>> Exibindo logs de erro da API:${NC}"
    docker-compose logs api
    exit 1
fi
