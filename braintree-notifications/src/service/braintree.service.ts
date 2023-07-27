import { logger } from '../utils/logger.utils';
import { Request } from 'express';
import braintree, {
  BaseWebhookNotification,
  Environment,
  TransactionRequest,
} from 'braintree';
import CustomError from '../errors/custom.error';
const getBraintreeGateway = () => {
  const braintreeEnv = process.env;
  if (
    !braintreeEnv.BRAINTREE_MERCHANT_ID ||
    !braintreeEnv.BRAINTREE_PUBLIC_KEY ||
    !braintreeEnv.BRAINTREE_PRIVATE_KEY
  ) {
    throw new CustomError(
      500,
      'Internal Server Error - braintree config is missing'
    );
  }
  return new braintree.BraintreeGateway({
    environment:
      braintreeEnv.BRAINTREE_ENVIRONMENT === 'Production'
        ? Environment.Production
        : Environment.Sandbox,
    merchantId: braintreeEnv.BRAINTREE_MERCHANT_ID,
    publicKey: braintreeEnv.BRAINTREE_PUBLIC_KEY,
    privateKey: braintreeEnv.BRAINTREE_PRIVATE_KEY,
  });
};
export const parseNotification = async (
  request: Request
): Promise<BaseWebhookNotification> => {
  const gateway = getBraintreeGateway();
  const { bt_signature, bt_payload } = request.body;
  const response = await gateway.webhookNotification.parse(
    bt_signature,
    bt_payload
  );
  logger.info(
    `[Webhook Received ${response.timestamp} ] | Kind: ${response.kind}`
  );
  return response;
};

export const transactionSale = async (request: TransactionRequest) => {
  const gateway = getBraintreeGateway();
  const response = await gateway.transaction.sale(request);
  logger.info(`transactionSale`, response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.transaction;
};
