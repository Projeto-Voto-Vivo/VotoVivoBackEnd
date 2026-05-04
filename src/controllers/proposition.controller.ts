import { Request, Response, NextFunction } from 'express';
import { PropositionService } from '../services/proposition.service';

export class PropositionController {
  constructor(private readonly propositionService: PropositionService) {}

  listPropositions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.propositionService.listPropositions();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getPropositionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.propositionService.getPropositionById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  createProposition = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.propositionService.createProposition(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };
}