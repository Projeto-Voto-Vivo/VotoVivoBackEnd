# Voto Vivo - API

> Plataforma Digital de Dados Eleitorais Integrados

**Voto Vivo** é um projeto de extensão que visa combater a assimetria de informação e a desinformação no cenário eleitoral brasileiro. Esta API serve como backend centralizado para fornecer dados transparentes, auditáveis e de fácil compreensão sobre candidatos e parlamentares.

## 🚀 Funcionalidades (MVP)

A API fornece dados processados a partir de fontes oficiais (Câmara dos Deputados/TSE):
* **Perfil Parlamentar:** Dados biográficos, histórico de partidos, status atual, gabinete e redes sociais.
* **Transparência Financeira:** Detalhamento completo e sumarização (resumo por categoria) do uso da Cota Parlamentar (CEAP).
* **Busca e Filtros:** Listagem de deputados com filtros por nome, partido e UF.

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
* Python 3 (Necessário apenas se desejar popular o banco de dados)

### ⚡ Instalação Rápida (Recomendado)

O projeto inclui um script de automação (`populate_db.sh`) que configura o banco, clona o repositório de dados, importa as informações e inicia a API.

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/seu-usuario/voto-vivo-api.git](https://github.com/seu-usuario/voto-vivo-api.git)
    cd voto-vivo-api
    ```

2.  **Dê permissão e execute o script:**
    ```bash
    chmod +x populate_db.sh 
    ./populate_db.sh // --no-import se não quiser popular os dados
    ```
    *Este script irá subir o container MySQL, criar o ambiente virtual Python, baixar os dados reais da Câmara e popular o banco localmente.*

### ⚙️ Instalação Manual

Caso prefira configurar manualmente sem popular os dados massivos:

1.  **Configure o ambiente:**
    Crie um arquivo `.env` na raiz:
    ```env
    DATABASE_URL="mysql://root@localhost:3306/votovivo"
    PORT=3000
    ```

2.  **Suba o Banco de Dados:**
    ```bash
    docker-compose up -d mysql_db
    ```

3.  **Gere as tabelas (Prisma):**
    ```bash
    npx prisma generate
    npx prisma migrate dev
    ```

4.  **Inicie a API:**
    ```bash
    npm run dev
    ```

## 📚 Documentação da API

A documentação interativa está disponível via Swagger UI.
Após iniciar o servidor, acesse:
👉 **http://localhost:3000/api-docs**

### Principais Endpoints
* `GET /deputados` - Lista deputados com paginação e filtros.
* `GET /deputados/:id` - Detalhes completos de um parlamentar.
* `GET /deputados/:id/gastos` - Lista detalhada de despesas.
* `GET /deputados/:id/gastos/resumo` - Agrupamento de gastos por tipo.

## 🧪 Testes

O projeto utiliza TDD. Para rodar a suíte de testes unitários e de integração:

```bash
npm test
```
## Metodologia

Este projeto segue uma metodologia híbrida, utilizando práticas ágeis (Scrum) na fase de construção e TDD (Test Driven Development) para garantir a robustez do software.

---

*InsInstituto Federal de São Paulo - Campus São Paulo* Projeto de Extensão Sistemas de informação - 2025
