import request from 'supertest';
import app from '../src/app';

describe('Setup do Projeto', () => {
  it('Deve responder na rota raiz', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Voto Vivo API operante' });
  });
});
