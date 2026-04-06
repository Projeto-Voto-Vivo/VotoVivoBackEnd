-- CreateTable
CREATE TABLE `PARLAMENTAR` (
    `idParlamentar` INTEGER NOT NULL AUTO_INCREMENT,
    `idApi` INTEGER NOT NULL,
    `cargo` VARCHAR(50) NULL,
    `nomeCivil` VARCHAR(255) NULL,
    `nomeUrna` VARCHAR(255) NULL,
    `partidoAtual` VARCHAR(50) NULL,
    `uf` CHAR(2) NULL,
    `fotoUrl` VARCHAR(500) NULL,
    `dataNascimento` DATE NULL,
    `email` VARCHAR(255) NULL,
    `telefone` VARCHAR(20) NULL,
    `enderecoGabinete` VARCHAR(500) NULL,

    UNIQUE INDEX `PARLAMENTAR_idApi_key`(`idApi`),
    PRIMARY KEY (`idParlamentar`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PROPOSICAO` (
    `idProposicao` INTEGER NOT NULL AUTO_INCREMENT,
    `idApi` INTEGER NOT NULL,
    `siglaTipo` VARCHAR(10) NULL,
    `number` INTEGER NULL,
    `year` INTEGER NULL,
    `ementa` TEXT NULL,
    `statusAtual` VARCHAR(100) NULL,

    UNIQUE INDEX `PROPOSICAO_idApi_key`(`idApi`),
    PRIMARY KEY (`idProposicao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VOTACAO` (
    `idVotacao` INTEGER NOT NULL AUTO_INCREMENT,
    `idApi` INTEGER NOT NULL,
    `idProposicao` INTEGER NULL,
    `dataVotacao` DATE NULL,
    `resumoMateria` TEXT NULL,
    `resultadoFinal` VARCHAR(100) NULL,
    `tipoVotacao` VARCHAR(50) NULL,

    UNIQUE INDEX `VOTACAO_idApi_key`(`idApi`),
    PRIMARY KEY (`idVotacao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VOTO` (
    `idVoto` INTEGER NOT NULL AUTO_INCREMENT,
    `idParlamentar` INTEGER NOT NULL,
    `idVotacao` INTEGER NOT NULL,
    `votoRegistrado` ENUM('YES', 'NO', 'ABSTENTION', 'ABSENT') NULL,

    PRIMARY KEY (`idVoto`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AUTORIA_PROPOSICAO` (
    `idParlamentar` INTEGER NOT NULL,
    `idProposicao` INTEGER NOT NULL,

    PRIMARY KEY (`idParlamentar`, `idProposicao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `REDE_SOCIAL` (
    `idRedeSocial` INTEGER NOT NULL AUTO_INCREMENT,
    `idParlamentar` INTEGER NOT NULL,
    `plataforma` VARCHAR(50) NULL,
    `url` VARCHAR(500) NULL,

    PRIMARY KEY (`idRedeSocial`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DESPESA` (
    `idDespesa` INTEGER NOT NULL AUTO_INCREMENT,
    `idParlamentar` INTEGER NOT NULL,
    `dataDespesa` DATE NULL,
    `valor` DECIMAL(10, 2) NULL,
    `fornecedorNome` VARCHAR(255) NULL,
    `fornecedorCnpjCpf` VARCHAR(20) NULL,
    `notaFiscalUrl` VARCHAR(500) NULL,
    `category` VARCHAR(100) NULL,

    PRIMARY KEY (`idDespesa`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VOTACAO` ADD CONSTRAINT `VOTACAO_idProposicao_fkey` FOREIGN KEY (`idProposicao`) REFERENCES `PROPOSICAO`(`idProposicao`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VOTO` ADD CONSTRAINT `VOTO_idParlamentar_fkey` FOREIGN KEY (`idParlamentar`) REFERENCES `PARLAMENTAR`(`idParlamentar`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VOTO` ADD CONSTRAINT `VOTO_idVotacao_fkey` FOREIGN KEY (`idVotacao`) REFERENCES `VOTACAO`(`idVotacao`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AUTORIA_PROPOSICAO` ADD CONSTRAINT `AUTORIA_PROPOSICAO_idParlamentar_fkey` FOREIGN KEY (`idParlamentar`) REFERENCES `PARLAMENTAR`(`idParlamentar`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AUTORIA_PROPOSICAO` ADD CONSTRAINT `AUTORIA_PROPOSICAO_idProposicao_fkey` FOREIGN KEY (`idProposicao`) REFERENCES `PROPOSICAO`(`idProposicao`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `REDE_SOCIAL` ADD CONSTRAINT `REDE_SOCIAL_idParlamentar_fkey` FOREIGN KEY (`idParlamentar`) REFERENCES `PARLAMENTAR`(`idParlamentar`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DESPESA` ADD CONSTRAINT `DESPESA_idParlamentar_fkey` FOREIGN KEY (`idParlamentar`) REFERENCES `PARLAMENTAR`(`idParlamentar`) ON DELETE CASCADE ON UPDATE CASCADE;
