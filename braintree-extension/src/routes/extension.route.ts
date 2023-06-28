import { Router, NextFunction, Request, Response } from 'express';

import { post } from '../controllers/extension.controller';

const braintreeExtensionRouter: Router = Router();

braintreeExtensionRouter.post(
  '/',
  async function (req: Request, res: Response, next: NextFunction) {
    try {
      return await post(req, res);
    } catch (error) {
      next(error);
    }
  }
);

export default braintreeExtensionRouter;
