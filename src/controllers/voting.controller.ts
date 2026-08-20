import { Request, Response, NextFunction } from 'express';
import { VotingService } from '../services/voting.service';
import { parsePagination, parsePositiveInt } from '../lib/request-params';

export class VotingController {
  constructor(private readonly votingService: VotingService) {}

  listVotings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.votingService.listVotings(
        parsePagination(req.query as Record<string, unknown>),
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getVotingById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result = await this.votingService.getVotingById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
