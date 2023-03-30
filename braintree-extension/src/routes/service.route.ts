import { Router } from 'express';
import { post } from '../controllers/service.controller';

const serviceRouter = Router();

serviceRouter.post('/', post);

export default serviceRouter;
