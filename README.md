# Voto Vivo - API

> Plataforma Digital de Dados Eleitorais Integrados

[cite_start]O **Voto Vivo** é um projeto de extensão que visa combater a assimetria de informação e a desinformação no cenário eleitoral brasileiro[cite: 23]. [cite_start]Esta API serve como backend centralizado para fornecer dados transparentes, auditáveis e de fácil compreensão sobre candidatos e parlamentares (Deputados Federais no MVP)[cite: 54].

## 🚀 Funcionalidades (MVP)

A API fornece dados processados a partir de fontes oficiais (Câmara dos Deputados/TSE):
* **Perfil Parlamentar:** Dados biográficos, partidários e de contato.
* **Transparência Financeira:** Detalhamento e sumarização do uso da Cota Parlamentar (CEAP).
* [cite_start]**Atuação Legislativa (Em breve):** Histórico de votações e proposições de leis[cite: 58].

## 🛠 Tecnologias

* **Runtime:** Node.js
* **Linguagem:** TypeScript
* **Framework:** Express
* **Banco de Dados:** PostgreSQL
* **ORM:** Prisma
* **Testes:** Jest & Supertest (TDD)
* **Documentação:** Swagger (OpenAPI 3.0)

## 📦 Como Rodar o Projeto

### Pré-requisitos
* Node.js (v18+)
* Docker & Docker Compose (para o Banco de Dados)

### Instalação

1.  Clone o repositório:
    ```bash
    git clone [https://github.com/seu-usuario/voto-vivo-api.git](https://github.com/seu-usuario/voto-vivo-api.git)
    cd voto-vivo-api
    ```

2.  Instale as dependências:
    ```bash
    npm install
    ```

3.  Configure as variáveis de ambiente:
    Crie um arquivo `.env` na raiz baseado no exemplo:
    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/votovivo?schema=public"
    PORT=3000
    ```

4.  Suba o Banco de Dados (Docker):
    ```bash
    docker-compose up -d
    ```
    *(Ou certifique-se de ter uma instância Postgres rodando localmente)*

5.  Execute as migrações do banco:
    ```bash
    npx prisma migrate dev
    ```

### ▶️ Executando

* **Modo de Desenvolvimento:**
    ```bash
    npm run dev
    ```
    Acesse a documentação da API em: `http://localhost:3000/api-docs`

* **Rodando os Testes (TDD):**
    ```bash
    npm test
    ```

## 📚 Documentação da API

A documentação interativa (Swagger UI) é gerada automaticamente a partir do arquivo `swagger.yaml`.
Após iniciar o servidor, acesse `/api-docs` para testar os endpoints.

## 🤝 Metodologia

[cite_start]Este projeto segue uma metodologia híbrida, utilizando práticas ágeis (Scrum) na fase de construção e TDD (Test Driven Development) para garantir a robustez do software[cite: 121, 125].

---
**Instituto Federal de São Paulo - Campus São Paulo**
[cite_start]*Projeto de Extensão I - 2025* [cite: 1, 5, 20]
