# Voto Vivo - API

> Plataforma Digital de Dados Eleitorais Integrados

**Voto Vivo** é um projeto de extensão que visa combater a assimetria de informação e a desinformação no cenário eleitoral brasileiro. Esta API serve como backend centralizado para fornecer dados transparentes, auditáveis e de fácil compreensão sobre candidatos e parlamentares.

## Funcionalidades

A API fornece dados processados a partir de fontes oficiais (Câmara dos Deputados / Portal da Transparência):

- **Parlamentares:** Listagem com filtros por nome, partido e UF; perfil completo com dados biográficos, gabinete e redes sociais.
- **Despesas:** Detalhamento paginado do uso da Cota Parlamentar (CEAP) com filtros por ano e mês; resumo financeiro por categoria.
- **Votações:** Histórico paginado de votos nominais do parlamentar; detalhes de uma votação com todos os votos registrados.
- **Proposições:** Proposições das quais o parlamentar é autor, com paginação.
- **Presença:** Métricas de assiduidade calculadas a partir dos votos registrados.
- **Emendas Parlamentares:** Lista de emendas vinculadas ao parlamentar com valores empenhados, liquidados e pagos; resumo agregado de totais; documentos de execução por emenda.
- **Perfil Agregado:** Endpoint único que consolida visão geral, votações recentes, proposições, despesas e emendas para alimentar painéis do frontend.

## Tecnologias

- **Runtime:** Node.js (v22+)
- **Linguagem:** TypeScript
- **Framework:** Express 5
- **Banco de Dados:** MySQL 8.0
- **ORM:** Prisma
- **Documentação:** Swagger UI (OpenAPI 3.0)
- **Testes:** Jest + Supertest

## Como Rodar o Projeto

### Pré-requisitos

- Node.js v22+
- Docker e Docker Compose

### Instalação via Docker (recomendado)

```bash
# apenas API + banco de dados
npm run setup:docker

# API + banco de dados + frontend
npm run setup:docker:frontend
```

### Instalação local (sem Docker para a API)

1. Crie o arquivo `.env` na raiz do projeto:

```env
DATABASE_URL="mysql://root@localhost:3306/votovivo"
PORT=3000
```

2. Execute o script de preparação e inicie o servidor:

```bash
npm run setup:local
npm run dev
```

## Documentação da API

A documentação interativa está disponível via Swagger UI após iniciar o servidor:

**http://localhost:3001/api-docs**

### Endpoints

#### Parlamentares

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/parlamentares` | Lista parlamentares com filtros (`nome`, `partido`, `uf`) e paginação |
| `GET` | `/parlamentares/:id` | Perfil completo do parlamentar |
| `GET` | `/parlamentares/:id/perfil` | Perfil agregado (visão geral, votações, proposições, despesas, emendas) |
| `GET` | `/parlamentares/:id/despesas` | Despesas paginadas, com filtros opcionais de `ano` e `mes` |
| `GET` | `/parlamentares/:id/despesas/resumo` | Resumo financeiro: total anual, média mensal, maior reembolso e breakdown por categoria |
| `GET` | `/parlamentares/:id/votacoes` | Histórico paginado de votos nominais |
| `GET` | `/parlamentares/:id/proposicoes` | Proposições das quais o parlamentar é autor, paginadas |
| `GET` | `/parlamentares/:id/presenca` | Métricas de assiduidade (taxa, total de eventos, faltas) |
| `GET` | `/parlamentares/:id/emendas` | Emendas parlamentares vinculadas |
| `GET` | `/parlamentares/:id/emendas/resumo` | Totais agregados de emendas (empenhado, liquidado, pago) |

#### Emendas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/emendas/:id/detalhes` | Dados completos de uma emenda, incluindo parlamentares vinculados e documentos |
| `GET` | `/emendas/:id/documentos` | Documentos de execução (empenho, liquidação, pagamento) de uma emenda |

#### Votações

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/votacoes` | Lista todas as votações |
| `GET` | `/votacoes/:id` | Detalhes de uma votação com todos os votos registrados |
| `POST` | `/votacoes` | Cria uma votação |

#### Proposições

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/proposicoes` | Lista todas as proposições |
| `GET` | `/proposicoes/:id` | Detalhes de uma proposição |
| `POST` | `/proposicoes` | Cria uma proposição |

#### Votos

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/votacoes/:votingId/votos` | Lista votos de uma votação |
| `POST` | `/votos` | Registra um voto |
| `DELETE` | `/votos/:id` | Remove um voto |

## Testes

O projeto cobre todas as camadas com testes unitários (serviços) e testes de API (controladores via Supertest).

```bash
# rodar todos os testes
npm test

# modo watch (re-executa ao salvar)
npm run test:watch

# com relatório de cobertura
npm run test:coverage
```

### Estrutura dos testes

Cada serviço e controlador possui um arquivo `.spec.ts` colocado ao lado do arquivo de origem:

```
src/
├── services/
│   ├── parliamentarian.service.ts
│   ├── parliamentarian.service.spec.ts   # testes unitários
│   ├── amendment.service.spec.ts
│   ├── proposition.service.spec.ts
│   ├── voting.service.spec.ts
│   └── vote.service.spec.ts
└── controllers/
    ├── parliamentarian.controller.spec.ts  # testes de API
    ├── amendment.controller.spec.ts
    ├── proposition.controller.spec.ts
    ├── voting.controller.spec.ts
    └── vote.controller.spec.ts
```
