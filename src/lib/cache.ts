/**
 * Cache em memória com TTL e coalescência de requisições.
 *
 * A primeira linha de defesa é o cache da Cloudflare (ver `cache-control.ts`).
 * Este aqui existe para o que atravessa a borda, e resolve um problema que o
 * TTL sozinho não resolve: **o rebanho trovejante**. Quando N requisições
 * idênticas chegam juntas com o cache frio, todas as N vão ao banco. Guardando
 * a *promessa* em vez do valor, as N compartilham uma única consulta — que é
 * exatamente o padrão que derruba um MySQL pequeno.
 *
 * Não há invalidação explícita: o ETL roda noutro processo e não tem como
 * avisar. O TTL é curto de propósito, para limitar a janela em que uma resposta
 * pode estar velha depois de uma carga.
 */

type Entrada<T> = { valor: Promise<T>; expiraEm: number };

export type CacheOptions = {
  ttlSegundos?: number;
  /** Teto de chaves distintas. Impede que `?busca=` com termos infinitos vaze memória. */
  maxEntradas?: number;
  /** Relógio injetável nos testes. */
  agora?: () => number;
};

export class CacheTtl {
  private readonly entradas = new Map<string, Entrada<unknown>>();
  private readonly ttlMs: number;
  private readonly maxEntradas: number;
  private readonly agora: () => number;

  constructor(options: CacheOptions = {}) {
    const ttl = options.ttlSegundos ?? Number(process.env.CACHE_TTL_SEGUNDOS ?? 60);

    this.ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : 0;
    this.maxEntradas = options.maxEntradas ?? 500;
    this.agora = options.agora ?? (() => Date.now());
  }

  /** `CACHE_TTL_SEGUNDOS=0` desativa: útil em teste e em desenvolvimento. */
  get ativo(): boolean {
    return this.ttlMs > 0;
  }

  async resolver<T>(chave: string, produzir: () => Promise<T>): Promise<T> {
    if (!this.ativo) {
      return produzir();
    }

    const agora = this.agora();
    const atual = this.entradas.get(chave) as Entrada<T> | undefined;

    if (atual && atual.expiraEm > agora) {
      return atual.valor;
    }

    const valor = produzir();
    this.entradas.set(chave, { valor, expiraEm: agora + this.ttlMs });

    // Erro não pode ficar grudado no cache: uma falha momentânea do banco viraria
    // um minuto inteiro de respostas quebradas.
    valor.catch(() => {
      const guardada = this.entradas.get(chave);
      if (guardada?.valor === valor) {
        this.entradas.delete(chave);
      }
    });

    this.podar(agora);

    return valor;
  }

  /** Varredura preguiçosa: expirados primeiro, depois os mais antigos. */
  private podar(agora: number): void {
    if (this.entradas.size <= this.maxEntradas) {
      return;
    }

    for (const [chave, entrada] of this.entradas) {
      if (entrada.expiraEm <= agora) {
        this.entradas.delete(chave);
      }
    }

    // O Map preserva a ordem de inserção, então o primeiro é o mais antigo.
    while (this.entradas.size > this.maxEntradas) {
      const maisAntiga = this.entradas.keys().next().value;
      if (maisAntiga === undefined) break;
      this.entradas.delete(maisAntiga);
    }
  }

  limpar(): void {
    this.entradas.clear();
  }

  get tamanho(): number {
    return this.entradas.size;
  }
}

/** Chave estável a partir de um objeto de filtros. */
export function chaveDeFiltros(prefixo: string, filtros: unknown): string {
  return `${prefixo}:${JSON.stringify(filtros, ordenarChaves)}`;
}

function ordenarChaves(_chave: string, valor: unknown) {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
  }

  return valor;
}
