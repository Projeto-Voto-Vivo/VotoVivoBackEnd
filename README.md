# Voto Vivo - API

> Plataforma Digital de Dados Eleitorais Integrados

**Voto Vivo** é um projeto de extensão que visa combater a assimetria de informação e a desinformação no cenário eleitoral brasileiro. Esta API serve como backend centralizado para fornecer dados transparentes, auditáveis e de fácil compreensão sobre candidatos e parlamentares.

## 🚀 Funcionalidades (MVP)

A API fornece dados processados a partir de fontes oficiais (Câmara dos Deputados/TSE):
* **Perfil Parlamentar:** Dados biográficos, histórico de partidos, status atual, gabinete e redes sociais.
* **Transparência Financeira:** Detalhamento completo e sumarização (resumo por categoria) do uso da Cota Parlamentar (CEAP).
* **Busca e Filtros:** Listagem de parlamentares com filtros por nome, partido e UF.

## 🛠 Tecnologias

* **Runtime:** Node.js (v22+)
* **Linguagem:** TypeScript
* **Framework:** Express
* **Banco de Dados:** MySQL 8.0
* **ORM:** Prisma
* **Documentação:** Swagger (OpenAPI 3.0)
* **Testes:** Jest & Supertest
* **Scripts de Dados:** Python 3 (Integração com VotoVivoDataAggregator)

## 📦 Como Rodar o Projeto

### Pré-requisitos
* Node.js (v22+)
* Docker & Docker Compose

### ⚡ Instalação Rápida via Docker (Recomendado)

O projeto inclui scripts automatizados para facilitar a configuração do ambiente utilizando Docker.

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/Projeto-Voto-Vivo/VotoVivoBackEnd.git](https://github.com/Projeto-Voto-Vivo/VotoVivoBackEnd.git)
    cd voto-vivo-api
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Execute o script de setup:**
    Para iniciar apenas a API e o Banco de Dados:
    ```bash
    npm run setup:docker
    ```
    Para iniciar a API, o Banco de Dados e o Frontend simultaneamente:
    ```bash
    npm run setup:docker:frontend
    ```

### ⚙️ Instalação Local (Sem Docker para a API)

Caso prefira rodar a API localmente:

1.  **Configure o ambiente:**
    Crie um arquivo `.env` na raiz do projeto:
    ```env
    DATABASE_URL="mysql://root@localhost:3306/votovivo"
    PORT=3000
    ```

2.  **Execute o script local de preparação:**
    ```bash
    npm run setup:local
    ```

3.  **Inicie a API em modo de desenvolvimento:**
    ```bash
    npm run dev
    ```

## 📚 Documentação da API

A documentação interativa está disponível via Swagger UI.
Após iniciar os contentores Docker, acesse:
👉 **http://localhost:3001/api-docs** *(Nota: a API no Docker corre na porta 3001)*

### Principais Endpoints
* `GET /parlamentar` - Lista parlamentares com paginação e filtros.
* `GET /parlamentares/{id}` - Detalhes completos de um parlamentar.
* `GET /parlamentares/{id}/gastos` - Lista detalhada de despesas.
* `GET /parlamentares/{id}/gastos/resumo` - Agrupamento de gastos por tipo.

## 🧪 Testes

O projeto utiliza TDD. Para rodar a suíte de testes unitários e de integração:

```bash
npm test
