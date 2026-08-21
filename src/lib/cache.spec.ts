import { CacheTtl, chaveDeFiltros } from './cache';

describe('CacheTtl', () => {
  it('should only run the producer once within the TTL', async () => {
    const cache = new CacheTtl({ ttlSegundos: 60 });
    const produzir = jest.fn().mockResolvedValue(42);

    expect(await cache.resolver('k', produzir)).toBe(42);
    expect(await cache.resolver('k', produzir)).toBe(42);

    expect(produzir).toHaveBeenCalledTimes(1);
  });

  /**
   * O caso que derruba um MySQL pequeno: N requisições idênticas chegam juntas
   * com o cache frio. Guardando a promessa, as N compartilham uma consulta.
   */
  it('should coalesce concurrent callers into a single query', async () => {
    const cache = new CacheTtl({ ttlSegundos: 60 });
    let resolverPromessa: (v: number) => void = () => {};
    const produzir = jest.fn(
      () => new Promise<number>((resolve) => { resolverPromessa = resolve; }),
    );

    const chamadas = Promise.all(
      Array.from({ length: 50 }, () => cache.resolver('k', produzir)),
    );
    resolverPromessa(7);

    expect(await chamadas).toEqual(Array(50).fill(7));
    expect(produzir).toHaveBeenCalledTimes(1);
  });

  it('should run the producer again after the TTL expires', async () => {
    let agora = 1_000_000;
    const cache = new CacheTtl({ ttlSegundos: 60, agora: () => agora });
    const produzir = jest.fn().mockResolvedValue(1);

    await cache.resolver('k', produzir);
    agora += 61_000;
    await cache.resolver('k', produzir);

    expect(produzir).toHaveBeenCalledTimes(2);
  });

  /**
   * Uma falha momentânea do banco não pode virar um minuto inteiro de respostas
   * quebradas.
   */
  it('should not cache a rejection', async () => {
    const cache = new CacheTtl({ ttlSegundos: 60 });
    const produzir = jest
      .fn()
      .mockRejectedValueOnce(new Error('banco fora'))
      .mockResolvedValueOnce(5);

    await expect(cache.resolver('k', produzir)).rejects.toThrow('banco fora');
    expect(await cache.resolver('k', produzir)).toBe(5);
    expect(produzir).toHaveBeenCalledTimes(2);
  });

  /** `?busca=` com termos infinitos não pode vazar memória. */
  it('should bound the number of entries', async () => {
    const cache = new CacheTtl({ ttlSegundos: 60, maxEntradas: 10 });

    for (let i = 0; i < 100; i += 1) {
      await cache.resolver(`k${i}`, () => Promise.resolve(i));
    }

    expect(cache.tamanho).toBeLessThanOrEqual(10);
  });

  it('should be a passthrough when the TTL is zero', async () => {
    const cache = new CacheTtl({ ttlSegundos: 0 });
    const produzir = jest.fn().mockResolvedValue(1);

    await cache.resolver('k', produzir);
    await cache.resolver('k', produzir);

    expect(cache.ativo).toBe(false);
    expect(produzir).toHaveBeenCalledTimes(2);
    expect(cache.tamanho).toBe(0);
  });

  it('should read the TTL from the environment', async () => {
    const anterior = process.env.CACHE_TTL_SEGUNDOS;
    process.env.CACHE_TTL_SEGUNDOS = '0';

    try {
      expect(new CacheTtl().ativo).toBe(false);
    } finally {
      if (anterior === undefined) delete process.env.CACHE_TTL_SEGUNDOS;
      else process.env.CACHE_TTL_SEGUNDOS = anterior;
    }
  });
});

describe('chaveDeFiltros', () => {
  /** Sem isto, a mesma consulta geraria entradas diferentes conforme a ordem. */
  it('should produce the same key regardless of key order', () => {
    expect(chaveDeFiltros('p', { ano: 2024, tipo: 'PL' })).toBe(
      chaveDeFiltros('p', { tipo: 'PL', ano: 2024 }),
    );
  });

  it('should separate different filters', () => {
    expect(chaveDeFiltros('p', { ano: 2024 })).not.toBe(
      chaveDeFiltros('p', { ano: 2023 }),
    );
  });
});
