import { Request, Response, NextFunction } from 'express';
import { VoteService } from '../services/vote.service';
import { parsePositiveInt } from '../lib/request-params';

export class VoteController {
  constructor(private readonly voteService: VoteService) {}

  listVotesByVoting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const votingId = parsePositiveInt(req.params.votingId, 'votingId');
      const result = await this.voteService.listVotesByVoting(votingId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
