import { Router } from 'express';
import { post } from '../controllers/extension.controller';

const braintreeExtensionRouter = Router();

braintreeExtensionRouter.post('/', post);

export default braintreeExtensionRouter;
