import express, { Router } from 'express';
import request from 'supertest';
import { PropositionController } from './proposition.controller';
import { errorHandler } from '../middlewares/error-handler';

describe('PropositionController', () => {
  let app: express.Express;

  const serviceMock = {
    listPropositions: jest.fn(),
    getPropositionById: jest.fn(),
    createProposition: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = new PropositionController(serviceMock as any);
    const router = Router();

    router.get('/proposicoes', controller.listPropositions);
    router.get('/proposicoes/:id', controller.getPropositionById);
    router.post('/proposicoes', controller.createProposition);

    app = express();
    app.use(express.json());
    app.use(router);
    app.use(errorHandler);
  });

  describe('GET /proposicoes', () => {
    it('should return 200 and list of propositions', async () => {
      const propositions = [
        { id: 1, typeAbbreviation: 'PL', number: 123, year: 2024 },
      ];
      serviceMock.listPropositions.mockResolvedValue(propositions);

      const response = await request(app).get('/proposicoes');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(propositions);
      expect(serviceMock.listPropositions).toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.listPropositions.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/proposicoes');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });

  describe('GET /proposicoes/:id', () => {
    it('should return 200 and proposition with votings', async () => {
      const proposition = {
        id: 1,
        typeAbbreviation: 'PL',
        votings: [{ id: 1, finalResult: 'Aprovado' }],
      };
      serviceMock.getPropositionById.mockResolvedValue(proposition);

      const response = await request(app).get('/proposicoes/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(proposition);
      expect(serviceMock.getPropositionById).toHaveBeenCalledWith(1);
    });

    it('should return 200 with null when proposition does not exist', async () => {
      serviceMock.getPropositionById.mockResolvedValue(null);

      const response = await request(app).get('/proposicoes/999');

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.getPropositionById.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).get('/proposicoes/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });

  describe('POST /proposicoes', () => {
    it('should return 201 and created proposition', async () => {
      const body = { apiId: 100, typeAbbreviation: 'PL', number: 1, year: 2024 };
      serviceMock.createProposition.mockResolvedValue({ id: 1, ...body });

      const response = await request(app).post('/proposicoes').send(body);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: 1, ...body });
      expect(serviceMock.createProposition).toHaveBeenCalledWith(body);
    });

    it('should return 500 on unexpected error', async () => {
      serviceMock.createProposition.mockRejectedValue(new Error('Unexpected'));

      const response = await request(app).post('/proposicoes').send({});

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Erro interno do servidor.' });
    });
  });
});
