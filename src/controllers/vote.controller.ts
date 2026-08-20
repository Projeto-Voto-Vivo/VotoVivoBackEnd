import { Request, Response, NextFunction } from 'express';
import { VoteChoice } from '@prisma/client';
import { VoteService } from '../services/vote.service';
import { InvalidParameterError } from '../errors/http-errors';
import {
  getOptionalString,
  parsePagination,
  parsePositiveInt,
} from '../lib/request-params';

const VOTOS_VALIDOS: VoteChoice[] = [
  'SIM',
  'NAO',
  'ABSTENCAO',
  'OBSTRUCAO',
  'AUSENCIA_JUSTIFICADA',
  'AUSENTE',
  'NAO_REGISTRADO',
];

export class VoteController {
  constructor(private readonly voteService: VoteService) {}

  listVotesByVoting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const votingId = parsePositiveInt(req.params.votingId, 'votingId');
      const query = req.query as Record<string, unknown>;

      const result = await this.voteService.listVotesByVoting(
        votingId,
        parsePagination(query),
        { voto: this.parseVoto(query.voto) },
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  private parseVoto(valor: unknown): VoteChoice | undefined {
    const voto = getOptionalString(valor);

    if (!voto) {
      return undefined;
    }

    const normalizado = voto.toUpperCase().replace(/ /g, '_') as VoteChoice;

    if (!VOTOS_VALIDOS.includes(normalizado)) {
      throw new InvalidParameterError('voto');
    }

    return normalizado;
  }
}
