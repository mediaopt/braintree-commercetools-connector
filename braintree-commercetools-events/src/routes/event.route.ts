import { Router, NextFunction, Request, Response } from 'express';

import { post } from '../controllers/event.controller';

const eventRouter: Router = Router();

eventRouter.post(
  '/',
  async function (req: Request, res: Response, next: NextFunction) {
    try {
      return await post(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

export default eventRouter;
