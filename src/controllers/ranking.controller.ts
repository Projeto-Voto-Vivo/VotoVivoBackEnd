import { NextFunction, Request, Response } from 'express';
import { InvalidParameterError } from '../errors/http-errors';
import {
  getOptionalString,
  parsePagination,
} from '../lib/request-params';
import { Criterio, CRITERIOS, RankingService } from '../services/ranking.service';

export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  rankParliamentarians = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;

      const result = await this.rankingService.rankParliamentarians(
        {
          tema: getOptionalString(query.tema),
          funcaoEmenda: getOptionalString(query.funcaoEmenda),
          destinoEmenda: getOptionalString(query.destinoEmenda),
          comissao: getOptionalString(query.comissao),
          partido: getOptionalString(query.partido),
          casa: getOptionalString(query.casa),
          uf: getOptionalString(query.uf),
          pesos: parsePesos(query.pesos),
        },
        parsePagination(query),
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listRankingOptions = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.rankingService.listRankingOptions();

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * `pesos=tema:2,destinoEmenda:1` — quanto cada critério vale na média.
 *
 * Formato compacto porque são até quatro critérios e um parâmetro por critério
 * (`pesoTema`, `pesoFuncaoEmenda`, …) encheria a query de ruído.
 *
 * Tudo que não casa é 400, nunca ignorado em silêncio: um peso descartado
 * devolveria um ranking calculado de outro jeito, com a mesma cara do pedido.
 */
function parsePesos(valor: unknown): Partial<Record<Criterio, number>> | undefined {
  const texto = getOptionalString(valor);

  if (!texto) {
    return undefined;
  }

  const pesos: Partial<Record<Criterio, number>> = {};

  for (const parte of texto.split(',')) {
    const [nome, bruto] = parte.split(':').map((pedaco) => pedaco.trim());

    if (!CRITERIOS.includes(nome as Criterio)) {
      throw new InvalidParameterError(
        'pesos',
        `Parâmetro inválido: pesos. "${nome}" não é um critério (${CRITERIOS.join(', ')}).`,
      );
    }

    const peso = Number(bruto);

    // Zero anularia o critério em vez de pesá-lo — quem não quer um critério
    // simplesmente não o envia. Negativo inverteria o ranking em silêncio.
    if (!Number.isFinite(peso) || peso <= 0) {
      throw new InvalidParameterError(
        'pesos',
        `Parâmetro inválido: pesos. O peso de "${nome}" deve ser um número maior que zero.`,
      );
    }

    pesos[nome as Criterio] = peso;
  }

  return pesos;
}
