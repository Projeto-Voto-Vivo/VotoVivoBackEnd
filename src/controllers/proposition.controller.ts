import { Request, Response, NextFunction } from 'express';
import { PropositionService } from '../services/proposition.service';
import { parsePagination, parsePositiveInt } from '../lib/request-params';

export class PropositionController {
  constructor(private readonly propositionService: PropositionService) {}

  listPropositions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.propositionService.listPropositions(
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
