import { Request, Response, NextFunction } from 'express';
import { PropositionService } from '../services/proposition.service';
import {
  getOptionalString,
  parsePagination,
  parsePositiveInt,
} from '../lib/request-params';

export class PropositionController {
  constructor(private readonly propositionService: PropositionService) {}

  listPropositions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;

      const result = await this.propositionService.listPropositions(
        parsePagination(query),
        {
          tipo: getOptionalString(query.tipo),
          ano: query.ano === undefined || query.ano === ''
            ? undefined
            : parsePositiveInt(query.ano, 'ano'),
          casa: getOptionalString(query.casa),
          situacao: getOptionalString(query.situacao),
          tema: getOptionalString(query.tema),
          busca: getOptionalString(query.busca),
          autor:
            query.autor === undefined || query.autor === ''
              ? undefined
              : parsePositiveInt(query.autor, 'autor'),
        },
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listFilterOptions = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.propositionService.listFilterOptions();

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listTramitacoes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result = await this.propositionService.listTramitacoes(
        id,
        parsePagination(req.query as Record<string, unknown>),
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getPropositionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result = await this.propositionService.getPropositionById(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
