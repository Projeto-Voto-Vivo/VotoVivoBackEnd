import { Prisma } from '@prisma/client';
import { agruparEmendas, LinhaBruta } from './agrupamento-emendas';

describe('agruparEmendas', () => {
  const linha = (
    chave: string | null,
    quantidade: number,
    empenhado: unknown,
    pago: unknown = 0,
  ): LinhaBruta => ({ chave, quantidade, empenhado, pago });

  it('should format values as decimal strings with two places', () => {
    const r = agruparEmendas([linha('Saúde', 3, new Prisma.Decimal('21400000'), '11200000.5')]);

    expect(r.itens[0]).toEqual({
      chave: 'Saúde',
      quantidade: 3,
      empenhado: '21400000.00',
      pago: '11200000.50',
    });
  });

  /**
   * Milhões com centavos: somar em ponto flutuante é onde o centavo some sem
   * ninguém notar. O `Decimal` atravessa a agregação e só vira texto na saída.
   */
  it('should not lose cents when summing', () => {
    const r = agruparEmendas([
      linha('Saúde', 1, '10000000.01'),
      linha('Saúde', 1, '20000000.02'),
      linha('Saúde', 1, '0.07'),
    ]);

    expect(r.itens[0].empenhado).toBe('30000000.10');
    expect(r.itens[0].quantidade).toBe(3);
  });

  it('should accept whatever shape the driver returns', () => {
    const r = agruparEmendas([
      linha('A', 1, new Prisma.Decimal('1.50')),
      linha('B', 1, '2.25'),
      linha('C', 1, 3.75),
      linha('D', 1, null),
    ]);

    expect(r.itens.map((i) => i.empenhado)).toEqual(['3.75', '2.25', '1.50', '0.00']);
  });

  describe('o que fica de fora', () => {
    /**
     * Um balde "Não informado" viraria uma barra grande competindo com áreas
     * reais, como se ausência de dado fosse uma área de atuação.
     */
    it('should keep rows without a key out of the list', () => {
      const r = agruparEmendas([linha('Saúde', 2, '100.00'), linha(null, 3, '900.00')]);

      expect(r.itens).toHaveLength(1);
      expect(r.itens[0].chave).toBe('Saúde');
      expect(r.semDado).toBe(3);
    });

    /** Nulo e string vazia voltam como duas linhas e são o mesmo caso. */
    it('should treat null, empty and blank as the same missing bucket', () => {
      const r = agruparEmendas([
        linha(null, 1, '10.00'),
        linha('', 2, '20.00'),
        linha('   ', 4, '30.00'),
      ]);

      expect(r.itens).toHaveLength(0);
      expect(r.semDado).toBe(7);
      expect(r.empenhadoSemDado).toBe('60.00');
    });

    /**
     * A contagem sozinha não reconcilia: 3 emendas de fora podem ser R$ 3 ou
     * R$ 30 milhões, e o painel não teria como fechar a soma das barras com o
     * total.
     */
    it('should report how much the missing rows are worth', () => {
      const r = agruparEmendas([linha('Saúde', 1, '100.00'), linha(null, 1, '4100000.00')]);

      expect(r.empenhadoSemDado).toBe('4100000.00');
    });

    it('should report zero when nothing is missing', () => {
      const r = agruparEmendas([linha('Saúde', 1, '100.00')]);

      expect(r.semDado).toBe(0);
      expect(r.empenhadoSemDado).toBe('0.00');
    });
  });

  describe('agrupamento da chave', () => {
    /**
     * Espaço em volta não é grafia diferente. Grafia de verdade — dois
     * municípios homônimos em estados diferentes — continua separada, porque
     * unificar errado esconde para onde o dinheiro foi.
     */
    it('should merge keys that differ only by surrounding whitespace', () => {
      const r = agruparEmendas([linha('SÃO PAULO - SP', 1, '10.00'), linha('  SÃO PAULO - SP  ', 2, '20.00')]);

      expect(r.itens).toHaveLength(1);
      expect(r.itens[0]).toMatchObject({ chave: 'SÃO PAULO - SP', quantidade: 3, empenhado: '30.00' });
    });

    it('should keep homonymous municipalities in different states apart', () => {
      const r = agruparEmendas([linha('BOM JESUS - RS', 1, '10.00'), linha('BOM JESUS - PI', 1, '20.00')]);

      expect(r.itens).toHaveLength(2);
    });
  });

  /**
   * Por dinheiro, não por contagem: uma emenda de R$ 5 milhões e uma de R$ 50
   * mil contam igual numa contagem, e é o dinheiro que diz onde o parlamentar
   * de fato atua.
   */
  it('should rank by committed amount, not by count', () => {
    const r = agruparEmendas([
      linha('Muitas e pequenas', 40, '50000.00'),
      linha('Poucas e grandes', 2, '5000000.00'),
    ]);

    expect(r.itens.map((i) => i.chave)).toEqual(['Poucas e grandes', 'Muitas e pequenas']);
  });

  it('should return an empty grouping for an empty input', () => {
    const r = agruparEmendas([]);

    expect(r).toEqual({ itens: [], semDado: 0, empenhadoSemDado: '0.00' });
  });
});
