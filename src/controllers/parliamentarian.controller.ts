import { NextFunction, Request, Response } from 'express';
import { ParliamentarianService } from '../services/parliamentarian.service';

export class ParliamentarianController {
  constructor(private readonly parliamentarianService: ParliamentarianService) {}

  listParliamentarians = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.parliamentarianService.listParliamentarians({
        nome: this.getOptionalString(req.query.nome),
        partido: this.getOptionalString(req.query.partido),
        uf: this.getOptionalString(req.query.uf),
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
      const id = this.parsePositiveInt(req.params.id, 'id');
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
      const id = this.parsePositiveInt(req.params.id, 'id');

      const result =
        await this.parliamentarianService.listExpensesByParliamentarianId(id, {
          ano: this.getOptionalNumber(req.query.ano),
          mes: this.getOptionalNumber(req.query.mes),
          pagina: this.getOptionalNumber(req.query.pagina),
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
      const id = this.parsePositiveInt(req.params.id, 'id');

      const result =
        await this.parliamentarianService.getExpenseSummaryByParliamentarianId(
          id,
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
      const id = this.parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.listAmendmentsByParliamentarianId(id);

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
      const id = this.parsePositiveInt(req.params.id, 'id');
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
      const id = this.parsePositiveInt(req.params.id, 'id');
      const result =
        await this.parliamentarianService.listPropositionsByParliamentarianId(
          id,
        );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  private parsePositiveInt(value: string | string[], fieldName: string): number {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Parâmetro inválido: ${fieldName}.`);
    }

    return parsed;
  }

  private getOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private getOptionalNumber(value: unknown): number | undefined {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    return parsed;
  }
}
