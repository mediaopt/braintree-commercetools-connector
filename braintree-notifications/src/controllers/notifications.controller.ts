import { Request, Response } from 'express';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { parseNotification } from '../service/braintree.service';
import { WebhookNotificationKind } from 'braintree';

/**
 * Exposed braintree-commercetools-event POST endpoint.
 * Receives the Pub/Sub message and works with it
 *
 * @param {Request} request The express request
 * @param {Response} response The express response
 * @returns
 */
export const post = async (request: Request, response: Response) => {
  // Check request body
  if (!request.body) {
    logger.error('Missing request body.');
    throw new CustomError(400, 'Bad request: Missing body');
  }
  logger.info(JSON.stringify(request.body));
  // Check if the body comes in a message
  if (!request.body['bt_signature']) {
    logger.error('Missing body signature');
    throw new CustomError(400, 'Bad request: Missing signature');
  }
  if (!request.body['bt_payload']) {
    logger.error('Missing body payload');
    throw new CustomError(400, 'Bad request: Missing payload');
  }
  try {
    const notification = await parseNotification(request);
    const kind: WebhookNotificationKind = notification.kind;
    switch (kind) {
      case 'check':
        response.status(200).send();
        return;
      default:
        response.status(200).send();
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new CustomError(500, error.message);
    }
  }
};
