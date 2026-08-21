import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * `Cache-Control` para o CDN à frente da API.
 *
 * Em produção a API fica atrás da Cloudflare, e a Cloudflare **não guarda JSON
 * sem instrução explícita** — sem este header, toda requisição atravessava até o
 * MySQL. Como os dados só mudam quando o ETL roda (uma vez por dia), entre
 * cargas toda resposta é estática e pode ficar na borda por horas.
 *
 * As quatro diretivas fazem coisas diferentes:
 *
 *  - `max-age`      navegador segura por pouco tempo (o usuário pode recarregar
 *                   esperando dado novo);
 *  - `s-maxage`     a borda segura por muito tempo — é o que tira a carga do
 *                   servidor. A invalidação vem da purga que o ETL dispara ao
 *                   terminar, não do relógio;
 *  - `stale-while-revalidate`  ninguém espera revalidação: serve o velho e
 *                   atualiza por trás;
 *  - `stale-if-error`  **o mais importante**: se o banco cair, a borda continua
 *                   servindo a última resposta boa. A queda deixa de ser visível
 *                   para quem está lendo o site.
 *
 * Só GET recebe cache. A API é somente-leitura, então na prática é tudo — mas a
 * checagem impede que uma rota futura vaze algo cacheável por engano.
 */

export type CacheControlOptions = {
  /** Janela do navegador, em segundos. */
  maxAge?: number;
  /** Janela do CDN, em segundos. */
  sMaxAge?: number;
  /** Por quanto tempo servir resposta velha enquanto revalida. */
  staleWhileRevalidate?: number;
  /** Por quanto tempo servir resposta velha se a origem falhar. */
  staleIfError?: number;
};

const UMA_SEMANA = 604800;

export function cacheControl(options: CacheControlOptions = {}): RequestHandler {
  const maxAge = options.maxAge ?? Number(process.env.CACHE_MAX_AGE ?? 300);
  const sMaxAge = options.sMaxAge ?? Number(process.env.CACHE_S_MAXAGE ?? 86400);
  const staleWhileRevalidate = options.staleWhileRevalidate ?? UMA_SEMANA;
  const staleIfError = options.staleIfError ?? UMA_SEMANA;

  const valor = [
    'public',
    `max-age=${maxAge}`,
    `s-maxage=${sMaxAge}`,
    `stale-while-revalidate=${staleWhileRevalidate}`,
    `stale-if-error=${staleIfError}`,
  ].join(', ');

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.setHeader('Cache-Control', valor);
    }

    next();
  };
}
