import { NextFunction, Request, Response } from 'express';
import { ParliamentarianService } from '../services/parliamentarian.service';
import { OBJETOS_VOTACAO, ObjetoVotacao } from '../domain/objeto-votacao';
import { InvalidParameterError } from '../errors/http-errors';
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
      const query = req.query as Record<string, unknown>;

      const result =
        await this.parliamentarianService.listVotingsByParliamentarianId(id, {
          pagina: getOptionalNumber(query.pagina),
          limite: getOptionalNumber(query.limite),
          proposicao: opcionalPositivo(query.proposicao, 'proposicao'),
          tipo: getOptionalString(query.tipo),
          ano: opcionalPositivo(query.ano, 'ano'),
          tema: getOptionalString(query.tema),
          busca: getOptionalString(query.busca),
          objeto: parseObjeto(query.objeto),
          apenasMerito: query.apenasMerito === 'true',
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
        await this.parliamentarianService.getAlignmentByParliamentarianId(id, {
          objeto: parseObjeto(req.query.objeto),
          apenasMerito: req.query.apenasMerito === 'true',
        });

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
          {
            objeto: parseObjeto(req.query.objeto),
            apenasMerito: req.query.apenasMerito === 'true',
          },
        );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getThemeAlignmentByParliamentarianId = async (
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
        await this.parliamentarianService.getThemeAlignmentByParliamentarianId(
          id,
          limite,
          {
            objeto: parseObjeto(req.query.objeto),
            apenasMerito: req.query.apenasMerito === 'true',
          },
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

/**
 * `objeto` fora do dominio vira 400 em vez de ser ignorado: um filtro que o
 * servidor descarta em silencio devolve a lista inteira e o cliente acredita
 * que ela ja esta recortada.
 */
/**
 * Inteiro positivo opcional. Vazio e ausente sao a mesma coisa; qualquer outra
 * coisa e 400 — `Number('abc')` e `NaN`, e `NaN` no Prisma vira 500.
 */
function opcionalPositivo(valor: unknown, campo: string): number | undefined {
  if (valor === undefined || valor === '') {
    return undefined;
  }

  return parsePositiveInt(valor, campo);
}

function parseObjeto(valor: unknown): ObjetoVotacao | undefined {
  const objeto = getOptionalString(valor);

  if (!objeto) {
    return undefined;
  }

  const normalizado = objeto.toUpperCase() as ObjetoVotacao;

  if (!OBJETOS_VOTACAO.includes(normalizado)) {
    throw new InvalidParameterError('objeto');
  }

  return normalizado;
}
