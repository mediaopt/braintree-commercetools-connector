import { Router } from 'express';
import { post } from '../controllers/service.controller';

const braintreeExtensionRouter = Router();

braintreeExtensionRouter.post('/', post);

export default braintreeExtensionRouter;
