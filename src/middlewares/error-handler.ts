import { NextFunction, Request, Response } from 'express';
import { InvalidParameterError, NotFoundError } from '../errors/http-errors';

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof NotFoundError) {
    return res.status(404).json({
      message: error.message,
    });
  }

  if (error instanceof InvalidParameterError) {
    return res.status(400).json({
      message: error.message,
    });
  }

  // Compatibilidade com erros antigos lancados como `Error` puro. Codigo novo
  // deve usar `InvalidParameterError`.
  if (error.message.startsWith('Parâmetro inválido:')) {
    return res.status(400).json({
      message: error.message,
    });
  }

  console.error(error);

  return res.status(500).json({
    message: 'Erro interno do servidor.',
  });
}
