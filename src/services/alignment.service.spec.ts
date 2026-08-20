import { AlignmentService } from './alignment.service';

describe('AlignmentService', () => {
  let prismaMock: any;
  let service: AlignmentService;

  beforeEach(() => {
    prismaMock = {
      parliamentarian: { findUnique: jest.fn() },
      partyAffiliation: { count: jest.fn() },
      $queryRaw: jest.fn(),
    };

    service = new AlignmentService(prismaMock);
  });

  const deputado = () => {
    prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Deputado(a)' });
    prismaMock.partyAffiliation.count.mockResolvedValue(2);
  };

  it('should compute the rate from the aggregated orientation/vote pairs', async () => {
    deputado();
    prismaMock.$queryRaw.mockResolvedValue([
      { orientacao: 'Sim', voto: 'SIM', total: BigInt(8) },
      { orientacao: 'Sim', voto: 'NAO', total: BigInt(2) },
    ]);

    const result = await service.getAlignmentByParliamentarianId(1);

    expect(result).toEqual({
      disponivel: true,
      taxa: 80,
      seguiu: 8,
      divergiu: 2,
      consideradas: 10,
      liberadas: 0,
      fonteFiliacao: 'historico',
    });
  });

  /**
   * "Liberado" e "Artigo 17" nao sao orientacao: a bancada liberou o voto.
   * Conta-los como divergencia inventaria infidelidade partidaria.
   */
  it('should keep released votes out of the denominator', async () => {
    deputado();
    prismaMock.$queryRaw.mockResolvedValue([
      { orientacao: 'Sim', voto: 'SIM', total: BigInt(3) },
      { orientacao: 'Liberado', voto: 'NAO', total: BigInt(5) },
      { orientacao: 'Artigo 17', voto: 'NAO', total: BigInt(2) },
    ]);

    const result = await service.getAlignmentByParliamentarianId(1);

    expect(result).toMatchObject({
      taxa: 100,
      consideradas: 3,
      liberadas: 7,
      divergiu: 0,
    });
  });

  it('should compare accent-insensitively', async () => {
    deputado();
    prismaMock.$queryRaw.mockResolvedValue([
      { orientacao: 'Não', voto: 'NAO', total: BigInt(4) },
      { orientacao: 'Abstenção', voto: 'ABSTENCAO', total: BigInt(1) },
    ]);

    const result = await service.getAlignmentByParliamentarianId(1);

    expect(result).toMatchObject({ seguiu: 5, divergiu: 0, taxa: 100 });
  });

  it('should not invent divergence for an unknown orientation', async () => {
    deputado();
    prismaMock.$queryRaw.mockResolvedValue([
      { orientacao: 'Questão de Ordem', voto: 'SIM', total: BigInt(3) },
    ]);

    const result = await service.getAlignmentByParliamentarianId(1);

    expect(result).toMatchObject({ liberadas: 3, consideradas: 0, taxa: null });
  });

  it('should fall back to partidoAtual and flag it when there is no affiliation history', async () => {
    prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Deputado(a)' });
    prismaMock.partyAffiliation.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([
      { orientacao: 'Sim', voto: 'SIM', total: BigInt(1) },
    ]);

    const result = await service.getAlignmentByParliamentarianId(1);

    expect(result).toMatchObject({ fonteFiliacao: 'partidoAtual' });
  });

  /**
   * O agregador so grava orientacao de bancada da Camara. Devolver 0% para
   * senadores seria afirmar infidelidade que nao foi medida.
   */
  it('should report unavailable for senators instead of 0%', async () => {
    prismaMock.parliamentarian.findUnique.mockResolvedValue({ role: 'Senador(a)' });
    prismaMock.partyAffiliation.count.mockResolvedValue(1);

    const result = await service.getAlignmentByParliamentarianId(2);

    expect(result).toEqual({
      disponivel: false,
      motivo: 'ORIENTACAO_INDISPONIVEL_SENADO',
      taxa: null,
    });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('should return a null rate when there is nothing to compare', async () => {
    deputado();
    prismaMock.$queryRaw.mockResolvedValue([]);

    const result = await service.getAlignmentByParliamentarianId(1);

    expect(result).toMatchObject({ disponivel: true, taxa: null, consideradas: 0 });
  });
});
