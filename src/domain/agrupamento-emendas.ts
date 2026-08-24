import { Prisma } from '@prisma/client';

export type LinhaBruta = {
  chave: string | null;
  quantidade: number;
  empenhado: unknown;
  pago: unknown;
};

export type GrupoEmendas = {
  chave: string;
  quantidade: number;
  empenhado: string;
  pago: string;
};

export type Agrupamento = {
  itens: GrupoEmendas[];
  semDado: number;
  empenhadoSemDado: string;
};

/** Aceita o que o driver devolver e nunca perde centavo pelo caminho. */
export function paraDecimal(valor: unknown): Prisma.Decimal {
  if (valor === null || valor === undefined || valor === '') {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(valor as Prisma.Decimal.Value);
}

/** Duas casas, como os totais que a rota ja devolve. */
export const formatarValor = (valor: Prisma.Decimal): string => valor.toFixed(2);

export function agruparEmendas(linhas: LinhaBruta[]): Agrupamento {
  const porChave = new Map<
    string,
    { quantidade: number; empenhado: Prisma.Decimal; pago: Prisma.Decimal }
  >();

  let semDado = 0;
  let empenhadoSemDado = new Prisma.Decimal(0);

  for (const linha of linhas) {
    const chave = (linha.chave ?? '').trim();
    const empenhado = paraDecimal(linha.empenhado);
    const pago = paraDecimal(linha.pago);

    if (!chave) {
      semDado += linha.quantidade;
      empenhadoSemDado = empenhadoSemDado.plus(empenhado);
      continue;
    }

    const atual = porChave.get(chave);

    if (atual) {
      atual.quantidade += linha.quantidade;
      atual.empenhado = atual.empenhado.plus(empenhado);
      atual.pago = atual.pago.plus(pago);
      continue;
    }

    porChave.set(chave, { quantidade: linha.quantidade, empenhado, pago });
  }

  const itens = [...porChave.entries()].map(([chave, valores]) => ({
    chave,
    quantidade: valores.quantidade,
    empenhado: formatarValor(valores.empenhado),
    pago: formatarValor(valores.pago),
    ordem: valores.empenhado,
  }));

  itens.sort(
    (a, b) => b.ordem.comparedTo(a.ordem) || a.chave.localeCompare(b.chave, 'pt-BR'),
  );

  return {
    itens: itens.map(({ ordem: _ordem, ...item }) => item),
    semDado,
    empenhadoSemDado: formatarValor(empenhadoSemDado),
  };
}
