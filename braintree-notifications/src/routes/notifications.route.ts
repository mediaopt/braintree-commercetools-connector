import { Router } from 'express';
import { post } from '../controllers/notifications.controller';

const notificationRouter: Router = Router();

notificationRouter.post('/', post);

export default notificationRouter;
