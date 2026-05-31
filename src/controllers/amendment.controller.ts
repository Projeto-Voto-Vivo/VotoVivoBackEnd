import { NextFunction, Request, Response } from 'express';
import { AmendmentService } from '../services/amendment.service';

export class AmendmentController {
  constructor(private readonly amendmentService: AmendmentService) {}

  getAmendmentDetailsById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = this.parsePositiveInt(req.params.id, 'id');
      const result = await this.amendmentService.getAmendmentDetailsById(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listDocumentsByAmendmentId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = this.parsePositiveInt(req.params.id, 'id');
      const result = await this.amendmentService.listDocumentsByAmendmentId(id);

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
}
