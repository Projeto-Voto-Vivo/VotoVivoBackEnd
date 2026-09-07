import { NextFunction, Request, Response } from 'express';
import { StatsService } from '../services/stats.service';
import { parsePositiveInt } from '../lib/request-params';

/** Valor padrão para o parâmetro `?limite=`. */
const LIMITE_PADRAO = 10;

export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * GET /stats/emendas/total
   * Retorna o valor total consolidado de todas as emendas pagas.
   */
  getTotalPaidAmendments = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.statsService.getTotalPaidAmendments();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /stats/despesas/ranking?limite=N
   * Retorna os N parlamentares com maior soma de despesas.
   */
  getExpenseRanking = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const limite =
        req.query.limite === undefined
          ? LIMITE_PADRAO
          : parsePositiveInt(req.query.limite, 'limite');

      const result = await this.statsService.getExpenseRanking(limite);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /stats/emendas/ranking?limite=N
   * Retorna os N parlamentares com maior soma de emendas pagas.
   */
  getAmendmentRanking = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const limite =
        req.query.limite === undefined
          ? LIMITE_PADRAO
          : parsePositiveInt(req.query.limite, 'limite');

      const result = await this.statsService.getAmendmentRanking(limite);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
