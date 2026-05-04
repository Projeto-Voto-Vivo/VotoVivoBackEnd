import { Request, Response, NextFunction } from 'express';
import { VotingService } from '../services/voting.service';

export class VotingController {
  constructor(private readonly votingService: VotingService) {}

  listVotings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.votingService.listVotings();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getVotingById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = this.parsePositiveInt(req.params.id);
      const result = await this.votingService.getVotingById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  createVoting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.votingService.createVoting(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  private parsePositiveInt(value: string | string[]): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('ID inválido');
    }
    return parsed;
  }
}
