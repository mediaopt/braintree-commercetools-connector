import { Router } from 'express';
import { post } from '../controllers/event.controller';

const eventRouter: Router = Router();

eventRouter.post('/', post);

export default eventRouter;
