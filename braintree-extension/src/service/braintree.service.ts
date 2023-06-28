import { logger } from '../utils/logger.utils';
import braintree, {
  ClientTokenRequest,
  TransactionRequest,
  Environment,
  Customer,
  CustomerCreateRequest,
  ValidatedResponse,
  CustomerUpdateRequest,
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

function logResponse(
  requestName: string,
  response: ValidatedResponse<any> | Customer
) {
  logger.info(`${requestName} response: ${JSON.stringify(response)}`);
}

export const getClientToken = async (request: ClientTokenRequest) => {
  const gateway = getBraintreeGateway();
  const response = await gateway.clientToken.generate(request);
  logResponse('getClientToken', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.clientToken;
};

export const transactionSale = async (request: TransactionRequest) => {
  const gateway = getBraintreeGateway();
  const response = await gateway.transaction.sale(request);
  logResponse('transactionSale', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.transaction;
};

export const refund = async (transactionId: string, amount?: string) => {
  const gateway = getBraintreeGateway();
  const response = await gateway.transaction.refund(transactionId, amount);
  logResponse('refund', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.transaction;
};

export const voidTransaction = async (transactionId: string) => {
  const gateway = getBraintreeGateway();
  const response = await gateway.transaction.void(transactionId);
  logResponse('void', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.transaction;
};

export const submitForSettlement = async (
  transactionId: string,
  amount?: string
) => {
  const gateway = getBraintreeGateway();
  const response = amount
    ? await gateway.transaction.submitForPartialSettlement(
        transactionId,
        amount
      )
    : await gateway.transaction.submitForSettlement(transactionId);
  logResponse('submitForSettlement', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.transaction;
};

export const findCustomer = async (customerId: string): Promise<Customer> => {
  const gateway = getBraintreeGateway();
  const response = await gateway.customer.find(customerId);
  logResponse('findCustomer', response);
  return response;
};

export const createCustomer = async (
  request: CustomerCreateRequest
): Promise<Customer> => {
  const gateway = getBraintreeGateway();
  const response = await gateway.customer.create(request);
  logResponse('createCustomer', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.customer;
};

export const updateCustomer = async (
  id: string,
  request: CustomerUpdateRequest
): Promise<Customer> => {
  const gateway = getBraintreeGateway();
  const response = await gateway.customer.update(id, request);
  logResponse('updateCustomer', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.customer;
};
