import { Router, NextFunction, Request, Response } from 'express';

import { post } from '../controllers/notifications.controller';

const notificationRouter: Router = Router();

notificationRouter.post(
  '/',
  async function (req: Request, res: Response, next: NextFunction) {
    try {
      return await post(req, res);
    } catch (error) {
      next(error);
    }
  }
);

export default notificationRouter;
