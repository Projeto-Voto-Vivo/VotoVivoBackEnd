import { Request, Response, NextFunction } from 'express';
import { VoteService } from '../services/vote.service';

export class VoteController {
  constructor(private readonly voteService: VoteService) {}

  listVotesByVoting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const votingId = Number(req.params.votingId);
      const result = await this.voteService.listVotesByVoting(votingId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  createVote = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.voteService.createVote(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteVote = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.voteService.deleteVote(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}