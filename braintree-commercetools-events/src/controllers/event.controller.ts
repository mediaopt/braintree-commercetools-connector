import { NextFunction, Request, Response } from 'express';
import { createApiRoot } from '../client/create.client';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import {
  MessagePayload,
  PaymentInteractionAddedMessagePayload,
} from '@commercetools/platform-sdk/dist/declarations/src/generated/models/message';
import {
  CustomerUpdate,
  CustomerUpdateAction,
} from '@commercetools/platform-sdk';
import { BRAINTREE_CUSTOMER_TYPE_KEY } from '../connector/actions';
import {getOrderById, getPaymentById} from "../services/commercetools.service";
import {findSuitableTransactionId} from "../services/payments.service";
import {Package, ParcelAddedToDeliveryMessagePayload} from "../types/index.types";
import {addPackageTracking} from "../services/braintree.service";

function parseRequest(request: Request) {
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
    logger.info(`Payload received: ${decodedData}`);
    return JSON.parse(decodedData) as MessagePayload;
  }
  throw new CustomError(400, 'Bad request: No payload in the Pub/Sub message');
}

const setBraintreeCustomerId = async (
  customerId: string,
  customerVersion: number
) => {
  logger.info(`Updating braintreeCustomerId to ${customerId}`);
  await createApiRoot()
    .customers()
    .withId({ ID: customerId })
    .post({
      body: {
        version: customerVersion,
        actions: [
          {
            action: 'setCustomType',
            type: {
              typeId: 'type',
              key: BRAINTREE_CUSTOMER_TYPE_KEY,
            },
            fields: {
              braintreeCustomerId: customerId,
            },
          } as CustomerUpdateAction,
        ],
      } as CustomerUpdate,
    })
    .execute();
};

const handlePaymentInteractionAdded = async (
  messagePayload: PaymentInteractionAddedMessagePayload
) => {
  if (
    messagePayload?.interaction?.fields?.type !== 'transactionSaleResponse' ||
    !messagePayload?.interaction?.fields?.data
  ) {
    return;
  }
  const data = JSON.parse(messagePayload.interaction.fields.data);
  const customerId = data?.customer?.id;
  if (!customerId) {
    logger.info('transactionSaleResponse has no braintree customer id');

    return;
  }
  const customer = await createApiRoot()
    .customers()
    .withId({ ID: customerId })
    .get()
    .execute();
  // Execute the tasks in need
  logger.info(JSON.stringify(customer));
  if (customer.body.custom?.fields?.braintreeCustomerId) {
    logger.info('braintreeCustomerId already set');
    return;
  }
  await setBraintreeCustomerId(customerId, customer.body.version);
};


const handleParcelAddedToDelivery = async (
    message: ParcelAddedToDeliveryMessagePayload
) => {
  if (!process.env.BRAINTREE_SEND_TRACKING) {
    return;
  }
  const order = await getOrderById(message.resource.id);
  if (!order) {
    logger.info(`Could not load order with id ${message.resource.id}`);
    return;
  }
  logger.info(`Loaded order with id ${order.id}`);
  if (!order?.paymentInfo?.payments) {
    logger.info(`No payments assigned to order with id ${order.id}`);
    return;
  }
  const parcel = message.parcel;
  logger.info(parcel);
  const payment = (
      await Promise.all(
          order.paymentInfo?.payments.map(async ({ id }) => {
            const payment = await getPaymentById(id);
            if (!payment) return undefined;
            const captureTransaction = findSuitableTransactionId(payment, 'Charge');
            return payment?.custom?.fields?.PayPalOrderId && captureTransaction
                ? payment
                : undefined;
          })
      )
  ).find((id) => id);
  logger.info(payment);
  if (!payment) {
    logger.info(
        `No charged PayPal payment assigned to order with id ${order.id}`
    );
    return;
  }
  const request = {
    trackingNumber: parcel?.trackingData?.trackingId,
    carrier: parcel?.trackingData?.carrier,
    transactionId: findSuitableTransactionId(payment, 'Charge'),
  } as Package;
  logger.info(JSON.stringify(request));
  const response = await addPackageTracking(
      payment?.custom?.fields?.PayPalOrderId,
      request
  );
  logger.info(JSON.stringify(response));
  return;
};


/**
 * Exposed event POST endpoint.
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
    logger.info('Event message received');
    const messagePayload = parseRequest(request);
    switch (messagePayload.type) {
      case 'PaymentInteractionAdded':
        handlePaymentInteractionAdded(messagePayload);
        response.status(200).send();
        break;
      case 'ParcelAddedToDelivery':
        await handleParcelAddedToDelivery(
            messagePayload as unknown as ParcelAddedToDeliveryMessagePayload
        );
        response.status(204).send();
        return;
      default:
        response.status(200).send();
    }
  } catch (error) {
    if (error instanceof Error) {
      next(new CustomError(400, error.message));
    } else {
      next(error);
    }
  }
};
