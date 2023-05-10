import { logger } from '../utils/logger.utils';
import braintree, {
  ClientTokenRequest,
  TransactionRequest,
  Environment,
} from 'braintree';
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
export const getClientToken = async (request: ClientTokenRequest) => {
  const gateway = getBraintreeGateway();
  const response = await gateway.clientToken.generate(request);
  logger.info('getClientToken Response: ' + JSON.stringify(response));
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.clientToken;
};

export const transactionSale = async (request: TransactionRequest) => {
  const gateway = getBraintreeGateway();
  const response = await gateway.transaction.sale(request);
  logger.info('transactionSale Response: ' + JSON.stringify(response));
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.transaction;
};
