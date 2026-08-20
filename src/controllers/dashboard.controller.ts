import { NextFunction, Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { InvalidParameterError } from '../errors/http-errors';
import { parseMetrica } from '../lib/metricas';
import { getOptionalString, parsePositiveInt } from '../lib/request-params';

const LIMITE_PADRAO = 10;
const LIMITE_MAX = 100;

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  getTotalEmendas = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.dashboardService.getTotalEmendas({
        ano: this.optionalYear(req.query.ano),
        tipo: getOptionalString(req.query.tipo),
        metrica: parseMetrica(req.query.metrica),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getTopEmendas = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.dashboardService.getTopEmendas({
        casa: this.requiredCasa(req.query.casa),
        ano: this.optionalYear(req.query.ano),
        limit: this.parseLimit(req.query.limit),
        confiancaMinima: this.parseConfianca(req.query.confiancaMinima),
        metrica: parseMetrica(req.query.metrica),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getTopDespesas = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.dashboardService.getTopDespesas({
        casa: this.requiredCasa(req.query.casa),
        ano: this.optionalYear(req.query.ano),
        limit: this.parseLimit(req.query.limit),
        normalizar: getOptionalString(req.query.normalizar),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  compare = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.dashboardService.compare({
        ids: this.parseIds(req.query.ids),
        permitirCasasDistintas: req.query.permitirCasasDistintas === 'true',
        metrica: parseMetrica(req.query.metrica),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * `casa` e obrigatorio nos rankings: sem ele o ranking misturaria cotas e
   * regras de duas casas diferentes e o numero nao significaria nada.
   */
  private requiredCasa(value: unknown): string {
    const casa = getOptionalString(value);

    if (!casa) {
      throw new InvalidParameterError(
        'casa',
        'Informe casa=camara ou casa=senado: os rankings das duas casas não são comparáveis entre si.',
      );
    }

    return casa;
  }

  private optionalYear(value: unknown): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    return parsePositiveInt(value, 'ano');
  }

  private parseLimit(value: unknown): number {
    if (value === undefined || value === '') {
      return LIMITE_PADRAO;
    }

    return Math.min(parsePositiveInt(value, 'limit'), LIMITE_MAX);
  }

  private parseConfianca(value: unknown): number {
    if (value === undefined || value === '') {
      return 0;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new InvalidParameterError('confiancaMinima');
    }

    return parsed;
  }

  private parseIds(value: unknown): number[] {
    const raw = getOptionalString(value);

    if (!raw) {
      throw new InvalidParameterError('ids');
    }

    return raw.split(',').map((id) => parsePositiveInt(id.trim(), 'ids'));
  }
}
