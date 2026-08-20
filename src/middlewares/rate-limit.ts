import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Rate limit por IP com janela fixa, em memoria.
 *
 * Segunda camada de defesa: o teto de volume fica no nginx
 * (`limit_req_zone`/`limit_conn_zone`), que roda antes do Node. Este middleware
 * e a cota por processo e vale tambem em desenvolvimento, onde nao ha nginx.
 *
 * Notas de implementacao que nao sao obvias:
 *  - Sem `setInterval` para expurgar entradas expiradas: um timer manteria o
 *    event loop vivo e brigaria com o `forceExit` do Jest. A varredura e
 *    preguicosa, no maximo uma por janela, dentro do proprio handler.
 *  - O relogio e o extrator de chave sao injetaveis para os testes poderem
 *    avancar a janela e simular IPs distintos sem fake timers.
 *  - `app.set('trust proxy', 1)` e pre-requisito: atras do nginx, sem isso
 *    `req.ip` e o IP do proxy e o limite vira global para todos os usuarios.
 *  - O contador e por processo. Com N replicas o teto efetivo e `max * N`; o
 *    teto global continua sendo responsabilidade do nginx.
 */

type Janela = { contagem: number; expiraEm: number };

export type RateLimitOptions = {
  /** Requisicoes permitidas por janela. `0` desativa o middleware. */
  max?: number;
  janelaSegundos?: number;
  /** Relogio injetavel (default `Date.now`). */
  agora?: () => number;
  /** Extrator da chave de contagem (default `req.ip`). */
  chave?: (req: Request) => string;
};

export function rateLimit(options: RateLimitOptions = {}): RequestHandler {
  const max = options.max ?? Number(process.env.RATE_LIMIT_MAX ?? 120);
  const janelaSegundos =
    options.janelaSegundos ?? Number(process.env.RATE_LIMIT_JANELA_SEGUNDOS ?? 60);
  const janelaMs = janelaSegundos * 1000;
  const agora = options.agora ?? (() => Date.now());
  const chaveDe =
    options.chave ?? ((req: Request) => req.ip ?? req.socket?.remoteAddress ?? 'desconhecido');

  // max=0 (ou configuracao invalida) desativa: passthrough sem headers.
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(janelaMs) || janelaMs <= 0) {
    return (_req, _res, next) => next();
  }

  const janelas = new Map<string, Janela>();
  let proximaVarredura = 0;

  return (req: Request, res: Response, next: NextFunction) => {
    const t = agora();

    if (t >= proximaVarredura) {
      for (const [chaveExpirada, janela] of janelas) {
        if (janela.expiraEm <= t) {
          janelas.delete(chaveExpirada);
        }
      }
      proximaVarredura = t + janelaMs;
    }

    const chave = chaveDe(req);
    let janela = janelas.get(chave);

    if (!janela || janela.expiraEm <= t) {
      janela = { contagem: 0, expiraEm: t + janelaMs };
      janelas.set(chave, janela);
    }

    janela.contagem += 1;

    const resetSegundos = Math.max(0, Math.ceil((janela.expiraEm - t) / 1000));
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - janela.contagem)));
    res.setHeader('RateLimit-Reset', String(resetSegundos));

    if (janela.contagem > max) {
      res.setHeader('Retry-After', String(resetSegundos));
      res.status(429).json({
        message: 'Limite de requisições excedido. Tente novamente em instantes.',
      });
      return;
    }

    next();
  };
}
