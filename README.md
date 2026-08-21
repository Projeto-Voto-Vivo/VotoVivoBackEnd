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
DATABASE_URL="mysql://root:test@localhost:3306/votovivo"
PORT=3001

# Restrição opcional de origem. Vazio (padrão) libera qualquer origem.
CORS_ORIGINS=""

# Cache. Em desenvolvimento vale deixar tudo em 0.
CACHE_MAX_AGE=0          # Cache-Control: max-age (navegador), em segundos
CACHE_S_MAXAGE=0         # Cache-Control: s-maxage (CDN), em segundos
CACHE_TTL_SEGUNDOS=0     # cache em memória de páginas e filtros; 0 desliga

# Rate limit por IP no Express. RATE_LIMIT_MAX=0 desativa.
RATE_LIMIT_MAX=120
RATE_LIMIT_JANELA_SEGUNDOS=60
```

### Contrato de dados com o ETL

O banco é alimentado **exclusivamente** pelo
[VotoVivoDataAggregator](https://github.com/Projeto-Voto-Vivo/VotoVivoDataAggregator);
esta API é somente-leitura. O `popular/schema.sql` daquele repositório é a fonte
de verdade do schema, e `prisma/schema.prisma` tem de refletí-lo 1:1.

Para verificar (exige Docker e o agregador clonado ao lado deste repositório):

```bash
npm run schema:check
```

O script sobe um MySQL descartável, carrega o SQL canônico e pede o diff ao
Prisma. **Diff vazio = contrato intacto**; qualquer `ALTER`/`CREATE` no output é
uma divergência a corrigir no `schema.prisma`.

Duas consequências do schema atual que valem lembrar:

- `parlamentar`, `proposicao` e `orgao` são únicos por `(idApi, discriminador de
  casa)`, não por `idApi` global — buscar por `apiId` exige `findFirst` com o
  discriminador (`role`/`house`/`casa`).
- O enum de voto tem **sete** valores (`SIM`, `NAO`, `ABSTENCAO`, `OBSTRUCAO`,
  `AUSENCIA JUSTIFICADA`, `AUSENTE`, `NAO REGISTRADO`). O Prisma lança erro em
  runtime ao ler um valor de enum desconhecido, então tirar um deles derruba
  toda votação que o contenha.

### Cache e carga

A API é somente-leitura sobre dados que só mudam quando o ETL roda. Isso permite
uma estratégia de cache agressiva, em duas camadas.

**1. Na borda (CDN).** Toda resposta GET sai com:

```
Cache-Control: public, max-age=300, s-maxage=86400,
               stale-while-revalidate=604800, stale-if-error=604800
```

`s-maxage` é o que tira a carga do servidor — a invalidação vem de uma purga que
o ETL dispara ao terminar, não do relógio. E `stale-if-error` é o mais valioso da
lista: **se o banco cair, a borda continua servindo a última resposta boa**, e a
queda deixa de ser visível para quem está lendo o site.

Para a Cloudflare guardar isso é preciso uma Cache Rule — ela não cacheia JSON
por conta própria. Em *Caching → Cache Rules*: `Eligible for cache`, Edge TTL
"use cache-control header", e a query string na chave de cache (os filtros vivem
nela).

**2. Na aplicação.** `CACHE_TTL_SEGUNDOS` guarda páginas de `/proposicoes` e os
domínios de `/proposicoes/filtros`. O cache guarda a **promessa**, não o valor,
então uma rajada de requisições idênticas com o cache frio faz uma consulta só em
vez de N — medido: 30 requisições simultâneas idênticas passaram de 151 para 7
`SELECT`s. Não há invalidação explícita (o ETL roda noutro processo), por isso o
TTL é curto.

Duas coisas que interagem com o cache e é fácil esquecer:

- **Restringir `CORS_ORIGINS` fragmenta o cache.** Com uma lista, o pacote `cors`
  passa a emitir `Vary: Origin` e o CDN mantém uma cópia por origem. O cache
  esfria e a carga volta.
- **`?contarTotal=false`** omite `meta.total` e `meta.lastPage`, evitando a
  segunda varredura da tabela que o `COUNT(*)` faz. Rolagem infinita só precisa
  de `meta.temProximaPagina`, que sai de buscar uma linha a mais.

### Índices do banco

`scripts/indices-recomendados.sql` traz os índices e chaves estrangeiras que as
rotas desta API precisam — placar de votação, filtros de proposição, busca
textual e o join de tramitação com órgão.

Eles **não** estão no `schema.prisma` de propósito: o `schema.sql` do agregador é
a fonte de verdade e o `npm run schema:check` exige diff vazio. Aplique o SQL no
banco, leve o mesmo DDL para o agregador e só então espelhe no Prisma — nessa
ordem, a verificação continua verde.

### Segurança

- **Somente-leitura**: não há rotas de escrita. Um teste de contrato
  (`src/app.spec.ts`) falha se alguma for reintroduzida.
- **CORS aberto por padrão**, apenas com o método `GET`. A API serve dados
  públicos e é somente-leitura, e CORS **não é controle de acesso**: ele só
  limita o que páginas web conseguem ler no navegador — `curl`, backends, apps
  e scrapers o ignoram por completo. Restringir origem não protegeria dado
  nenhum e bloquearia reuso legítimo dos dados; quem contém abuso é o rate
  limit por IP.

  Para restringir mesmo assim (ex.: reduzir uso do endpoint por sites de
  terceiros), preencha `CORS_ORIGINS` com uma lista separada por vírgula.
- **Rate limit em duas camadas**: o nginx segura o volume
  (`limit_req_zone` a 10r/s com burst 20, e no máximo 20 conexões por IP) e o
  Express aplica a cota por IP (`RATE_LIMIT_MAX` por
  `RATE_LIMIT_JANELA_SEGUNDOS`), respondendo **429** com `Retry-After` e os
  cabeçalhos `RateLimit-Limit`/`Remaining`/`Reset`.

  O contador do Express é **por processo**: com N réplicas o teto efetivo é
  `RATE_LIMIT_MAX × N`. O teto global continua sendo do nginx; não vale a pena
  introduzir Redis enquanto houver um único proxy à frente.

  `app.set('trust proxy', 1)` é pré-requisito — sem isso `req.ip` seria o IP do
  nginx e o limite viraria global para todos os usuários de uma vez.

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
| `GET` | `/parlamentares` | Lista parlamentares com filtros (`nome`, `partido`, `uf`, `casa`) e paginação (`pagina`, `limite`) |
| `GET` | `/parlamentares/:id` | Perfil completo do parlamentar |
| `GET` | `/parlamentares/:id/perfil` | Perfil agregado (visão geral, votações, proposições, despesas, emendas) |
| `GET` | `/parlamentares/:id/despesas` | Despesas paginadas, com filtros opcionais de `ano` e `mes` |
| `GET` | `/parlamentares/:id/despesas/resumo` | Resumo financeiro: total anual, média mensal, maior reembolso e breakdown por categoria |
| `GET` | `/parlamentares/:id/votacoes` | Histórico paginado de votos nominais |
| `GET` | `/parlamentares/:id/proposicoes` | Proposições das quais o parlamentar é autor, paginadas |
| `GET` | `/parlamentares/:id/presenca` | Assiduidade a partir da tabela `presenca`, com plenário e comissões separados e metodologia rotulada por casa |
| `GET` | `/parlamentares/:id/comissoes` | Órgãos colegiados de que o parlamentar participa (`membroOrgao`) |
| `GET` | `/parlamentares/:id/temas` | Perfil temático: em que temas mais legisla e como vota em proposições de cada tema |
| `GET` | `/parlamentares/:id/emendas` | Emendas vinculadas, paginadas, com `metodoVinculo` e `confiancaVinculo` |
| `GET` | `/parlamentares/:id/emendas/resumo` | Totais agregados de emendas (empenhado, liquidado, pago) |

> **Como ler `/parlamentares/:id/temas`.** O endpoint cruza `autoriaProposicao`
> e `voto` com `temaProposicao`, e três ressalvas viajam no `metadata` porque
> mudam a leitura do número:
>
> 1. Uma proposição com vários temas conta em **cada** um deles — a soma da
>    lista por tema é maior que `totalProposicoes`. Exiba os dois.
> 2. Votos em votações sem proposição (requerimentos, questões de ordem) e em
>    proposições sem tema não classificam e aparecem em `excluidos`, em vez de
>    sumirem em silêncio.
> 3. `votosSim`/`votosNao` é o voto registrado em votações **de proposições** do
>    tema, não posição sobre o tema: a votação pode ser sobre destaque
>    supressivo, requerimento de urgência ou texto principal, e o objeto do voto
>    não é distinguível no dado. Rotular como "apoia o tema" seria afirmar mais
>    do que o dado sustenta.

#### Emendas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/emendas/:id/detalhes` | Dados completos de uma emenda, incluindo parlamentares vinculados e documentos |
| `GET` | `/emendas/:id/documentos` | Documentos de execução (empenho, liquidação, pagamento) de uma emenda |

#### Votações

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/votacoes` | Lista paginada de votações (`pagina`, `limite`) |
| `GET` | `/votacoes/:id` | Detalhes com órgão, orientações de bancada e **placar agregado** |
| `GET` | `/votacoes/:votingId/votos` | Lista nominal paginada, com filtro opcional por `voto` |

#### Proposições

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/proposicoes` | Lista paginada, com filtros de `tipo`, `ano`, `casa`, `situacao`, `tema`, `busca` e `autor` aplicados no banco |
| `GET` | `/proposicoes/filtros` | Valores existentes de cada filtro, com contagens, para montar os dropdowns |
| `GET` | `/proposicoes/:id` | Detalhes: autores, `apiId` da fonte oficial, jornada bicameral e votações com placar |
| `GET` | `/proposicoes/:id/tramitacoes` | Histórico de tramitação, com órgão e regime de cada etapa |

> **`meta.total` reflete o filtro aplicado**, então a paginação é 100% do
> servidor: o cliente não precisa varrer páginas para recortar em memória.
> `situacao` casa por substring porque `proposicao.statusAtual` é texto livre
> das APIs da Câmara e do Senado — e é justamente por isso que
> `/proposicoes/filtros` existe: não há como o frontend adivinhar as redações
> válidas.
>
> `busca` procura por substring na ementa e no número. Fica no servidor porque
> busca no cliente só enxergaria a página corrente: com o universo completo
> carregado, o termo quase sempre casa numa página que o navegador não baixou.
> Como as tabelas usam `utf8mb4_unicode_ci`, a comparação é insensível a caixa
> e a acento (`saude` encontra `Saúde`).

> **Placar em vez da lista inteira.** `GET /votacoes/:id` devolve `placar`
> contado no banco (`groupBy`) e **não** embute a lista nominal: eram até 513
> objetos por votação, o que obrigava o cliente a limitar quantas votações
> conseguia detalhar. Quem precisa do voto de cada parlamentar usa
> `/votacoes/:id/votos`, que é paginado e aceita `?voto=NAO`.
>
> **Tramitação sem `@relation`.** `tramitacao.idOrgao` e
> `tramitacao.idTipoTramitacao` são colunas soltas no schema canônico, sem
> FOREIGN KEY. Declarar a relação no Prisma faria o `npm run schema:check`
> acusar divergência — o Prisma passaria a exigir duas chaves que o banco não
> tem, e um `db push` divergiria de produção em silêncio. Por isso o órgão e o
> regime são resolvidos em consulta separada, limitada aos ids da página. A
> correção definitiva é adicionar FK e índice no agregador; o payload já é o
> final.

#### Dashboards

Agregam em SQL e declaram a metodologia em `metadata` (métrica usada, janela e
o que ficou de fora da conta).

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/dashboards/emendas/total` | Total nacional por `ano`, `tipo` e `metrica` (`empenhado`/`liquidado`/`pago`) |
| `GET` | `/dashboards/emendas/top` | Ranking por parlamentar; `casa` obrigatória |
| `GET` | `/dashboards/despesas/top` | Ranking de despesas; `casa` obrigatória, `normalizar=mes` divide pelos meses de exercício |
| `GET` | `/dashboards/comparacao` | Compara 2 a 4 parlamentares com métricas normalizadas |

> **Por que `casa` é obrigatória nos rankings.** CEAP (Câmara) e CEAPS (Senado)
> têm tetos e regras distintos, e a presença tem cobertura diferente em cada
> casa. Um ranking misto produz um número sem significado — por isso
> `/dashboards/comparacao` também recusa comparar casas distintas sem
> `permitirCasasDistintas=true`.

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
