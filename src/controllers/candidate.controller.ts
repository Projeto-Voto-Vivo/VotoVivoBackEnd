import { NextFunction, Request, Response } from 'express';
import { CandidateService } from '../services/candidate.service';
import {
  getOptionalNumber,
  getOptionalString,
  parsePositiveInt,
} from '../lib/request-params';

export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  listCandidates = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.candidateService.listCandidates({
        nome: getOptionalString(req.query.nome),
        partido: getOptionalString(req.query.partido),
        uf: getOptionalString(req.query.uf),
        cargo: getOptionalString(req.query.cargo),
        ano: getOptionalNumber(req.query.ano),
        pagina: getOptionalNumber(req.query.pagina),
        limite: getOptionalNumber(req.query.limite),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getCandidateById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');

      const result =
        await this.candidateService.getCandidateById(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}