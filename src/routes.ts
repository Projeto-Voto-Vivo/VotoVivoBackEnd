import { Router } from 'express';
import { DeputadoController } from './controllers/DeputadoController';

const router = Router();
const deputadoController = new DeputadoController();

router.get('/deputados', deputadoController.listar);
router.get('/deputados/:id', deputadoController.buscar);
router.get('/deputados/:id/gastos', deputadoController.listarDespesas);
router.get('/deputados/:id/gastos/resumo', deputadoController.resumoDespesas);

export { router };
