import { VoteService } from './vote.service';
import { NotFoundError } from '../errors/http-errors';

describe('VoteService', () => {
  let prismaMock: any;
  let service: VoteService;

  beforeEach(() => {
    prismaMock = {
      vote: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      voting: {
        findUnique: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };

    service = new VoteService(prismaMock);
  });

  const voto = (id: number, ballotName: string, choice: string) => ({
    id,
    parliamentarianId: id,
    parliamentarian: { ballotName, currentParty: 'PT', state: 'SP' },
    choice,
  });

  describe('listVotesByVoting', () => {
    it('should return mapped votes with pagination meta', async () => {
      prismaMock.vote.findMany.mockResolvedValue([
        voto(1, 'João da Silva', 'SIM'),
        voto(2, 'Maria Santos', 'NAO'),
      ]);
      prismaMock.vote.count.mockResolvedValue(2);

      const result = await service.listVotesByVoting(1);

      expect(result.data).toEqual([
        { id: 1, parlamentarId: 1, parlamentar: 'João da Silva', siglaPartido: 'PT', uf: 'SP', voto: 'SIM' },
        { id: 2, parlamentarId: 2, parlamentar: 'Maria Santos', siglaPartido: 'PT', uf: 'SP', voto: 'NAO' },
      ]);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        lastPage: 1,
        limit: 20,
        temProximaPagina: false,
      });
    });

    /**
     * Era a última listagem sem `take` da API: uma votação de plenário da
     * Câmara devolvia 513 objetos de uma vez.
     */
    it('should apply skip/take', async () => {
      await service.listVotesByVoting(1, { page: 3, limit: 50 });

      expect(prismaMock.vote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 50 }),
      );
    });

    it('should filter by a specific choice', async () => {
      await service.listVotesByVoting(1, undefined, { voto: 'NAO' });

      expect(prismaMock.vote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { votingId: 1, choice: 'NAO' } }),
      );
      // O total precisa refletir o filtro, senão a paginação mente.
      expect(prismaMock.vote.count).toHaveBeenCalledWith({
        where: { votingId: 1, choice: 'NAO' },
      });
    });

    it('should pass the full canonical vote enum through', async () => {
      prismaMock.vote.findMany.mockResolvedValue([
        voto(1, 'A', 'OBSTRUCAO'),
        voto(2, 'B', 'NAO_REGISTRADO'),
        voto(3, 'C', 'AUSENCIA_JUSTIFICADA'),
      ]);
      prismaMock.vote.count.mockResolvedValue(3);

      const result = await service.listVotesByVoting(1);

      expect(result.data.map((v) => v.voto)).toEqual([
        'OBSTRUCAO',
        'NAO_REGISTRADO',
        'AUSENCIA_JUSTIFICADA',
      ]);
    });

    it('should throw NotFoundError when the voting does not exist', async () => {
      prismaMock.voting.findUnique.mockResolvedValue(null);

      await expect(service.listVotesByVoting(999)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(prismaMock.vote.findMany).not.toHaveBeenCalled();
    });

    it('should return an empty page when the voting has no votes', async () => {
      const result = await service.listVotesByVoting(1);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });
});
