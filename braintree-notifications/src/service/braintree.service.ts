import { logger } from '../utils/logger.utils';
import { Request } from 'express';
import braintree, { BaseWebhookNotification, Environment } from 'braintree';
import CustomError from '../errors/custom.error';
const getBraintreeGateway = () => {
  if (
    !process.env.BRAINTREE_MERCHANT_ID ||
    !process.env.BRAINTREE_PUBLIC_KEY ||
    !process.env.BRAINTREE_PRIVATE_KEY
  ) {
    throw new CustomError(
      500,
      'Internal Server Error - braintree config is missing'
    );
  }
  return new braintree.BraintreeGateway({
    environment:
      process.env.BRAINTREE_ENVIRONMENT === 'Production'
        ? Environment.Production
        : Environment.Sandbox,
    merchantId: process.env.BRAINTREE_MERCHANT_ID,
    publicKey: process.env.BRAINTREE_PUBLIC_KEY,
    privateKey: process.env.BRAINTREE_PRIVATE_KEY,
  });
};
export const parseNotification = async (
  request: Request
): Promise<BaseWebhookNotification> => {
  const gateway = getBraintreeGateway();
  const response = await gateway.webhookNotification.parse(
    request.body.bt_signature,
    request.body.bt_payload
  );
  logger.info(
    `[Webhook Received ${response.timestamp} ] | Kind: ${response.kind}`
  );
  return response;
};
