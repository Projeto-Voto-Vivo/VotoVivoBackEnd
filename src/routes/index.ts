import { Router } from 'express';
import { parliamentarianRouter } from './parliamentarian.routes';
import { votingRouter } from './voting.routes';
import { voteRouter } from './vote.routes';
import { propositionRouter } from './proposition.routes';
import { amendmentRouter } from './amendment.routes';

const router = Router();

router.use(parliamentarianRouter);
router.use(votingRouter);
router.use(voteRouter);
router.use(propositionRouter);
router.use(amendmentRouter);

export { router };
