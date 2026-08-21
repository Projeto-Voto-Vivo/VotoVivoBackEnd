import { NextFunction, Request, Response } from 'express';
import { ParliamentarianService } from '../services/parliamentarian.service';
import {
  getOptionalNumber,
  getOptionalString,
  parsePositiveInt,
} from '../lib/request-params';

export class ParliamentarianController {
  constructor(private readonly parliamentarianService: ParliamentarianService) {}

  listParliamentarians = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.parliamentarianService.listParliamentarians({
        nome: getOptionalString(req.query.nome),
        partido: getOptionalString(req.query.partido),
        uf: getOptionalString(req.query.uf),
        casa: getOptionalString(req.query.casa),
        pagina: getOptionalNumber(req.query.pagina),
        limite: getOptionalNumber(req.query.limite),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getParliamentarianById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result = await this.parliamentarianService.getParliamentarianById(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listExpensesByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');

      const result =
        await this.parliamentarianService.listExpensesByParliamentarianId(id, {
          ano: getOptionalNumber(req.query.ano),
          mes: getOptionalNumber(req.query.mes),
          pagina: getOptionalNumber(req.query.pagina),
          limite: getOptionalNumber(req.query.limite),
        });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getExpenseSummaryByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');

      const result =
        await this.parliamentarianService.getExpenseSummaryByParliamentarianId(
          id,
          {
            ano: getOptionalNumber(req.query.ano),
            mes: getOptionalNumber(req.query.mes),
          },
        );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listAmendmentsByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.listAmendmentsByParliamentarianId(id, {
          pagina: getOptionalNumber(req.query.pagina),
          limite: getOptionalNumber(req.query.limite),
        });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getAmendmentSummaryByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.getAmendmentSummaryByParliamentarianId(
          id,
        );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listPropositionsByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.listPropositionsByParliamentarianId(
          id,
          {
            pagina: getOptionalNumber(req.query.pagina),
            limite: getOptionalNumber(req.query.limite),
          },
        );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listVotingsByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.listVotingsByParliamentarianId(id, {
          pagina: getOptionalNumber(req.query.pagina),
          limite: getOptionalNumber(req.query.limite),
        });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getPresenceByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.getPresenceByParliamentarianId(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listCommitteesByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.listCommitteesByParliamentarianId(id, {
          pagina: getOptionalNumber(req.query.pagina),
          limite: getOptionalNumber(req.query.limite),
        });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getAlignmentByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.getAlignmentByParliamentarianId(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getThemeProfileByParliamentarianId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const limite =
        req.query.limite === undefined || req.query.limite === ''
          ? undefined
          : parsePositiveInt(req.query.limite, 'limite');

      const result =
        await this.parliamentarianService.getThemeProfileByParliamentarianId(
          id,
          limite,
        );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getAggregatedProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.getAggregatedProfile(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
