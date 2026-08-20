/**
 * Erros de dominio que o `errorHandler` traduz em status HTTP.
 *
 * Antes, `NotFoundError` morava dentro de `parliamentarian.service.ts` e o 400
 * era detectado por prefixo de mensagem (`'Parametro invalido:'`) — contrato
 * fragil que ja tinha produzido um bug real: `VotingController` lancava
 * `'ID invalido'` e a resposta virava 500 em vez de 400.
 */

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class InvalidParameterError extends Error {
  constructor(readonly field: string, message?: string) {
    super(message ?? `Parâmetro inválido: ${field}.`);
    this.name = 'InvalidParameterError';
  }
}
