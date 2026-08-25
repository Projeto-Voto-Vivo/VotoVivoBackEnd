import { InvalidParameterError } from '../errors/http-errors';
import { RankingService } from './ranking.service';

describe('RankingService', () => {
  let prismaMock: any;
  let service: RankingService;

  beforeEach(() => {
    prismaMock = {
      parliamentarian: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
    };

    service = new RankingService(prismaMock);
  });

  const pessoa = (id: number, nome: string, partido = 'PT', uf = 'SP') => ({
    id,
    ballotName: nome,
    currentParty: partido,
    state: uf,
    photoUrl: `foto-${id}`,
    role: 'Deputado(a)',
  });

  /** O pool que passou nos filtros. */
  const pool = (...pessoas: ReturnType<typeof pessoa>[]) => {
    prismaMock.parliamentarian.findMany.mockResolvedValue(pessoas);
  };

  /** Uma resposta de agregação por critério, na ordem em que são pedidos. */
  const valores = (...respostas: unknown[][]) => {
    respostas.forEach((resposta) => {
      prismaMock.$queryRaw.mockResolvedValueOnce(resposta);
    });
  };

  describe('exigir um critério', () => {
    /**
     * Sem critério não há ordem. Devolver todo mundo sob um campo chamado
     * `pontuacao` seria inventar um número com cara de resultado.
     */
    it('should refuse to rank with filters alone', async () => {
      await expect(
        service.rankParliamentarians({ partido: 'PT', uf: 'SP' }),
      ).rejects.toBeInstanceOf(InvalidParameterError);
    });

    it('should say which criteria exist in the error', async () => {
      await expect(service.rankParliamentarians({})).rejects.toThrow(/tema/);
      await expect(service.rankParliamentarians({})).rejects.toThrow(/destinoEmenda/);
    });

    it('should not touch the database when no criterion was given', async () => {
      await service.rankParliamentarians({}).catch(() => undefined);

      expect(prismaMock.parliamentarian.findMany).not.toHaveBeenCalled();
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('pontuação', () => {
    it('should give 100 to the top of each criterion', async () => {
      pool(pessoa(1, 'Ana'), pessoa(2, 'Bruno'));
      valores([{ id: 1, valor: 40 }, { id: 2, valor: 10 }]);

      const r = await service.rankParliamentarians({ tema: 'Saúde' });

      expect(r.data[0]).toMatchObject({ id: 1, pontuacao: 100 });
      expect(r.data[1]).toMatchObject({ id: 2, pontuacao: 25 });
    });

    it('should average the requested criteria', async () => {
      pool(pessoa(1, 'Ana'), pessoa(2, 'Bruno'));
      valores(
        [{ id: 1, valor: 10 }, { id: 2, valor: 10 }], // tema: empatam em 100
        [{ id: 1, valor: '100.00' }, { id: 2, valor: '50.00' }], // emenda: 100 e 50
      );

      const r = await service.rankParliamentarians({
        tema: 'Saúde',
        funcaoEmenda: 'Saúde',
      });

      expect(r.data[0]).toMatchObject({ id: 1, pontuacao: 100 });
      expect(r.data[1]).toMatchObject({ id: 2, pontuacao: 75 });
    });

    /**
     * Quem atende um critério de dois não pode empatar com quem atende os dois.
     * Ausência é zero, não "critério ignorado".
     */
    it('should count a missing criterion as zero, not as ignored', async () => {
      pool(pessoa(1, 'Ana'), pessoa(2, 'Bruno'));
      valores(
        [{ id: 1, valor: 10 }, { id: 2, valor: 10 }],
        [{ id: 1, valor: '100.00' }], // Bruno não tem emenda nessa função
      );

      const r = await service.rankParliamentarians({
        tema: 'Saúde',
        funcaoEmenda: 'Saúde',
      });

      const bruno = r.data.find((item) => item.id === 2);

      expect(bruno).toMatchObject({ pontuacao: 50, criteriosAtendidos: 1, criteriosPedidos: 2 });
    });

    it('should apply weights when asked', async () => {
      pool(pessoa(1, 'Ana'));
      valores(
        [{ id: 1, valor: 10 }],
        [], // ninguém pontua na emenda: Ana fica 100 e 0
      );

      const r = await service.rankParliamentarians({
        tema: 'Saúde',
        funcaoEmenda: 'Saúde',
        pesos: { tema: 3 },
      });

      // (100*3 + 0*1) / 4
      expect(r.data[0].pontuacao).toBe(75);
    });

    /** Quem não tem relação nenhuma com o pedido não é um resultado. */
    it('should drop candidates with no signal at all', async () => {
      pool(pessoa(1, 'Ana'), pessoa(2, 'Bruno'));
      valores([{ id: 1, valor: 40 }]);

      const r = await service.rankParliamentarians({ tema: 'Saúde' });

      expect(r.data).toHaveLength(1);
      expect(r.metadata.candidatos).toBe(2);
      expect(r.metadata.comAlgumSinal).toBe(1);
    });

    /** Divisão por zero não pode virar 100 para todo mundo. */
    it('should not award points when nobody scored on a criterion', async () => {
      pool(pessoa(1, 'Ana'));
      valores([{ id: 1, valor: 5 }], []);

      const r = await service.rankParliamentarians({
        tema: 'Saúde',
        destinoEmenda: 'MARTE - MS',
      });

      expect(r.data[0].criterios.destinoEmenda).toMatchObject({ pontuacao: 0 });
      expect(r.metadata.criteriosSemResultado).toEqual(['destinoEmenda']);
    });
  });

  describe('o que torna a nota auditável', () => {
    /**
     * A nota é relativa ao pool. Sem o valor bruto e sem o denominador, dois
     * rankings com filtros diferentes seriam incomparáveis e nada diria isso.
     */
    it('should expose the raw value and the pool maximum', async () => {
      pool(pessoa(1, 'Ana'), pessoa(2, 'Bruno'));
      valores([{ id: 1, valor: 40 }, { id: 2, valor: 10 }]);

      const r = await service.rankParliamentarians({ tema: 'Saúde' });

      expect(r.data[1].criterios.tema).toMatchObject({
        pedido: 'Saúde',
        valor: 10,
        unidade: 'proposicoes',
        pontuacao: 25,
      });
      expect(r.metadata.criterios[0]).toMatchObject({ maiorValorNoPool: 40 });
    });

    /** Dinheiro sai como string decimal, como no resumo de emendas. */
    it('should return money as a decimal string', async () => {
      pool(pessoa(1, 'Ana'));
      valores([{ id: 1, valor: '21400000.5' }]);

      const r = await service.rankParliamentarians({ funcaoEmenda: 'Saúde' });

      expect(r.data[0].criterios.funcaoEmenda).toMatchObject({
        valor: '21400000.50',
        unidade: 'reais_empenhados',
      });
    });

    /**
     * A ressalva que impede a interface de rotular isto como "quem mais
     * concorda com você" — o dado não sustenta essa leitura.
     */
    it('should warn that it measures activity, not agreement', async () => {
      pool(pessoa(1, 'Ana'));
      valores([{ id: 1, valor: 1 }]);

      const r = await service.rankParliamentarians({ tema: 'Saúde' });

      expect(r.metadata.observacao).toContain('ATUAÇÃO');
      expect(r.metadata.observacao).toContain('concorda');
    });
  });

  describe('filtros', () => {
    it('should filter the pool by party, state and house', async () => {
      pool(pessoa(1, 'Ana'));
      valores([{ id: 1, valor: 1 }]);

      await service.rankParliamentarians({
        tema: 'Saúde',
        partido: 'pt',
        uf: 'sp',
        casa: 'camara',
      });

      expect(prismaMock.parliamentarian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { currentParty: 'PT', state: 'SP', role: 'Deputado(a)' },
        }),
      );
    });

    /** Casa fora do domínio é 400, não lista vazia parecendo "ninguém atende". */
    it('should reject an unknown house', async () => {
      await expect(
        service.rankParliamentarians({ tema: 'Saúde', casa: 'xpto' }),
      ).rejects.toBeInstanceOf(InvalidParameterError);
    });

    /** Quem está fora do pool não pode pontuar nem mexer no denominador. */
    it('should ignore values from parliamentarians outside the pool', async () => {
      pool(pessoa(1, 'Ana'));
      valores([{ id: 1, valor: 10 }, { id: 99, valor: 1000 }]);

      const r = await service.rankParliamentarians({ tema: 'Saúde', partido: 'PT' });

      expect(r.data).toHaveLength(1);
      expect(r.data[0].pontuacao).toBe(100);
      expect(r.metadata.criterios[0].maiorValorNoPool).toBe(10);
    });
  });

  describe('paginação', () => {
    it('should paginate the ranking', async () => {
      pool(pessoa(1, 'Ana'), pessoa(2, 'Bruno'), pessoa(3, 'Carla'));
      valores([
        { id: 1, valor: 30 },
        { id: 2, valor: 20 },
        { id: 3, valor: 10 },
      ]);

      const r = await service.rankParliamentarians({ tema: 'Saúde' }, { page: 2, limit: 2 });

      expect(r.data.map((item) => item.id)).toEqual([3]);
      expect(r.meta).toMatchObject({ total: 3, page: 2, lastPage: 2 });
    });
  });
});
