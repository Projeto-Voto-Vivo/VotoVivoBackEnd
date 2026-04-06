import { Router } from 'express';
import { parliamentarianRouter } from './parliamentarian.routes';

const router = Router();

router.use(parliamentarianRouter);

export { router };
