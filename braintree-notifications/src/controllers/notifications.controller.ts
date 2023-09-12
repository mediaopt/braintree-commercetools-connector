import { NextFunction, Request, Response } from 'express';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { parseNotification } from '../service/braintree.service';
import { handleLocalPaymentCompleted } from '../service/commercetools.service';
import { WebhookNotificationKind, BaseWebhookNotification } from 'braintree';

type LocalPaymentCompleted = BaseWebhookNotification & {
  localPaymentCompleted: any;
};

const validateRequest = (request: Request) => {
  if (!request.body) {
    logger.error('Missing request body.');
    throw new CustomError(400, 'Bad request: Missing body');
  }
  logger.info(JSON.stringify(request.body));
  if (!request.body['bt_signature']) {
    logger.error('Missing body signature');
    throw new CustomError(400, 'Bad request: Missing signature');
  }
  if (!request.body['bt_payload']) {
    logger.error('Missing body payload');
    throw new CustomError(400, 'Bad request: Missing payload');
  }
};

/**
 * Exposed braintree-commercetools-event POST endpoint.
 * Receives the Pub/Sub message and works with it
 *
 * @param {Request} request The express request
 * @param {Response} response The express response
 * @param {NextFunction} next
 * @returns
 */
export const post = async (
  request: Request,
  response: Response,
  next: NextFunction
) => {
  try {
    logger.info('Webhook called');
    validateRequest(request);
    const notification = await parseNotification(request);
    const kind: WebhookNotificationKind = notification.kind;
    logger.info(`notification ${JSON.stringify(notification)}`);
    switch (kind) {
      case 'check':
        response.status(200).send();
        return;
      case 'local_payment_completed':
        const localPaymentCompleted = notification as LocalPaymentCompleted;
        const { paymentMethodNonce, paymentId } =
          localPaymentCompleted.localPaymentCompleted;

        if (!paymentId || !paymentMethodNonce) {
          logger.error('Missing request body.');
          throw new CustomError(400, 'Bad request: Missing body');
        }
        try {
          await handleLocalPaymentCompleted(paymentMethodNonce, paymentId);
        } catch (error) {
          throw new CustomError(
            500,
            'Error in handling local payment completed process'
          );
        }
        response.status(200).send();
        return;
      default:
        response.status(200).send();
    }
  } catch (error) {
    if (error instanceof Error) {
      next(new CustomError(500, error.message));
    } else {
      next(error);
    }
  }
};
