import { Request, Response } from 'express';
import { createApiRoot } from '../client/create.client';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { PaymentInteractionAddedMessagePayload } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/message';
import {
  CustomerUpdate,
  CustomerUpdateAction,
} from '@commercetools/platform-sdk';
import { BRAINTREE_CUSTOMER_TYPE_KEY } from '../connector/actions';

/**
 * Exposed event POST endpoint.
 * Receives the Pub/Sub message and works with it
 *
 * @param {Request} request The express request
 * @param {Response} response The express response
 * @returns
 */
export const post = async (request: Request, response: Response) => {
  logger.info('Event message received');
  let interaction: PaymentInteractionAddedMessagePayload|undefined = undefined;
  if (!request.body) {
    logger.error('Missing request body.');
    throw new CustomError(400, 'Bad request: No Pub/Sub message was received');
  }
  if (!request.body.message) {
    logger.error('Missing body message');
    throw new CustomError(400, 'Bad request: Wrong No Pub/Sub message format');
  }
  const pubSubMessage = request.body.message;
  const decodedData = pubSubMessage.data
    ? Buffer.from(pubSubMessage.data, 'base64').toString().trim()
    : undefined;
  if (decodedData) {
    interaction = JSON.parse(decodedData);
  }
  logger.info(`Payload received: ${decodedData}`);
  if (!interaction) {
    throw new CustomError(
      400,
      'Bad request: No payload in the Pub/Sub message'
    );
  }
  try {
    if (interaction?.interaction?.fields?.type === 'transactionSaleResponse' && interaction?.interaction?.fields?.data) {
      const data = JSON.parse(interaction.interaction.fields.data);
      const customerId = data?.customer?.id;
      if (customerId) {
        logger.info('transactionSaleResponse has no braintree customer id');
        response.status(204).send();
        return;
      }
      const customer = await createApiRoot()
        .customers()
        .withId({ ID: customerId })
        .get()
        .execute();
      // Execute the tasks in need
      logger.info(customer);
      if (!customer.body.custom?.fields?.customerId) {
        await createApiRoot()
          .customers()
          .withId({ ID: customerId })
          .post({
            body: {
              version: customer.body.version,
              actions: [
                {
                  action: 'setCustomType',
                  type: {
                    typeId: 'type',
                    key: BRAINTREE_CUSTOMER_TYPE_KEY,
                  },
                  fields: {
                    customerId: customerId,
                  },
                } as CustomerUpdateAction,
              ],
            } as CustomerUpdate,
          })
          .execute();
      }
    }
  } catch (error) {
    throw new CustomError(400, `Bad request: ${error}`);
  }
  response.status(204).send();
};
