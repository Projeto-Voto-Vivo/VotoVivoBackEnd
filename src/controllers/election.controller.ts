import { NextFunction, Request, Response } from 'express';
import { InvalidParameterError } from '../errors/http-errors';
import {
  getOptionalString,
  parsePagination,
  parsePositiveInt,
} from '../lib/request-params';
import { ElectionService } from '../services/election.service';

export class ElectionController {
  constructor(private readonly electionService: ElectionService) {}

  listResults = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;

      const result = await this.electionService.listResults(
        {
          ano: parseOptionalInt(query.ano, 'ano'),
          turno: parseTurno(query.turno),
          cargo: getOptionalString(query.cargo),
          uf: getOptionalString(query.uf),
        },
        parsePagination(query),
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getResultById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');

      const result = await this.electionService.getResultById(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listResultCandidates = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = parsePositiveInt(req.params.id, 'id');
      const query = req.query as Record<string, unknown>;

      const result = await this.electionService.listResultCandidates(
        id,
        {
          nome: getOptionalString(query.nome),
          partido: getOptionalString(query.partido),
          eleito: parseOptionalBoolean(query.eleito, 'eleito'),
        },
        parsePagination(query),
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getSeats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;
      const cargo = getOptionalString(query.cargo);

      // Somar cadeiras de cargos diferentes não é bancada de nada.
      if (!cargo) {
        throw new InvalidParameterError(
          'cargo',
          'Parâmetro obrigatório: cargo (ex. DEPUTADO FEDERAL, SENADOR).',
        );
      }

      const result = await this.electionService.getSeats({
        cargo,
        ano: parseOptionalInt(query.ano, 'ano'),
        uf: getOptionalString(query.uf),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

function parseOptionalInt(valor: unknown, campo: string): number | undefined {
  return valor === undefined ? undefined : parsePositiveInt(valor, campo);
}

function parseTurno(valor: unknown): number | undefined {
  const turno = parseOptionalInt(valor, 'turno');

  if (turno !== undefined && turno > 2) {
    throw new InvalidParameterError('turno');
  }

  return turno;
}

function parseOptionalBoolean(valor: unknown, campo: string): boolean | undefined {
  if (valor === undefined) {
    return undefined;
  }

  if (valor === 'true') return true;
  if (valor === 'false') return false;

  throw new InvalidParameterError(campo);
}
