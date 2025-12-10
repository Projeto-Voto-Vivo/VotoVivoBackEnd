-- CreateTable
CREATE TABLE "Deputado" (
    "id" SERIAL NOT NULL,
    "deputadoId" INTEGER NOT NULL,
    "nomeCivil" VARCHAR(255) NOT NULL,
    "cpf" VARCHAR(14) NOT NULL,
    "sexo" VARCHAR(1),
    "dataNascimento" DATE NOT NULL,
    "ufNascimento" VARCHAR(2),
    "municipioNascimento" VARCHAR(100),
    "escolaridade" VARCHAR(100),
    "uriDetalhes" TEXT,
    "urlWebsite" TEXT,

    CONSTRAINT "Deputado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusAtual" (
    "id" SERIAL NOT NULL,
    "statusId" INTEGER NOT NULL,
    "deputadoId" INTEGER NOT NULL,
    "urlPartido" TEXT,
    "siglaPartido" VARCHAR(10) NOT NULL,
    "urlFoto" TEXT,
    "nomeParlamentar" VARCHAR(255) NOT NULL,
    "uf" VARCHAR(2) NOT NULL,
    "emailStatus" TEXT,
    "descricaoStatus" TEXT,
    "situacao" TEXT,
    "data" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusAtual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gabinete" (
    "gabineteId" SERIAL NOT NULL,
    "statusAtualId" INTEGER NOT NULL,
    "andar" TEXT,
    "sala" TEXT,
    "nomeGabinete" TEXT,
    "emailGabinete" TEXT,
    "predio" TEXT,
    "telefone" TEXT,

    CONSTRAINT "Gabinete_pkey" PRIMARY KEY ("gabineteId")
);

-- CreateTable
CREATE TABLE "Despesa" (
    "despesaId" SERIAL NOT NULL,
    "deputadoId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "cnpjCpfFornecedor" VARCHAR(20),
    "nomeFornecedor" TEXT,
    "codDocumento" INTEGER,
    "dataDocumento" DATE NOT NULL,
    "numRessarcimento" INTEGER,
    "parcela" INTEGER,
    "tipoDespesa" TEXT NOT NULL,
    "tipoDocumento" TEXT,
    "urlDocumento" TEXT,
    "valorDocumento" DOUBLE PRECISION NOT NULL,
    "valorGlosa" DOUBLE PRECISION NOT NULL,
    "valorLiquido" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Despesa_pkey" PRIMARY KEY ("despesaId")
);

-- CreateTable
CREATE TABLE "RedeSocial" (
    "id" SERIAL NOT NULL,
    "deputadoId" INTEGER NOT NULL,
    "redeId" INTEGER NOT NULL,
    "linkRedeSocial" TEXT NOT NULL,

    CONSTRAINT "RedeSocial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deputado_deputadoId_key" ON "Deputado"("deputadoId");

-- CreateIndex
CREATE UNIQUE INDEX "Deputado_cpf_key" ON "Deputado"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "StatusAtual_statusId_key" ON "StatusAtual"("statusId");

-- AddForeignKey
ALTER TABLE "StatusAtual" ADD CONSTRAINT "StatusAtual_deputadoId_fkey" FOREIGN KEY ("deputadoId") REFERENCES "Deputado"("deputadoId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gabinete" ADD CONSTRAINT "Gabinete_statusAtualId_fkey" FOREIGN KEY ("statusAtualId") REFERENCES "StatusAtual"("statusId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_deputadoId_fkey" FOREIGN KEY ("deputadoId") REFERENCES "Deputado"("deputadoId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeSocial" ADD CONSTRAINT "RedeSocial_deputadoId_fkey" FOREIGN KEY ("deputadoId") REFERENCES "Deputado"("deputadoId") ON DELETE RESTRICT ON UPDATE CASCADE;
