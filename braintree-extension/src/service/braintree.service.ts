import { logger } from '../utils/logger.utils';
import braintree, {
  ClientTokenRequest,
  TransactionRequest,
  Environment,
  Customer,
  CustomerCreateRequest,
  ValidatedResponse,
  PaymentMethodCreateRequest,
  PaymentMethod,
  Transaction,
  PaymentMethodUpdateRequest,
} from 'braintree';
import CustomError from '../errors/custom.error';
import { Stream } from 'stream';
import { TransactionGateway } from '../interfaces/transaction.interface';
import { Package } from '../types/index.types';

const BRAINTREE_TIMEOUT_PAYMENT = 9500;
const BRAINTREE_TIMEOUT_CUSTOMER = 1500;

const getBraintreeGateway = (timeout: number = BRAINTREE_TIMEOUT_PAYMENT) => {
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
  const gateway = new braintree.BraintreeGateway({
    environment:
      process.env.BRAINTREE_ENVIRONMENT === 'Production'
        ? Environment.Production
        : Environment.Sandbox,
    merchantId: process.env.BRAINTREE_MERCHANT_ID,
    publicKey: process.env.BRAINTREE_PUBLIC_KEY,
    privateKey: process.env.BRAINTREE_PRIVATE_KEY,
  });
  gateway.config.timeout = timeout;
  return gateway;
};

function logResponse(
  requestName: string,
  response: ValidatedResponse<any> | Customer | Array<Transaction>
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
    const prefix = ['soft_declined', 'hard_declined'].includes(
      response?.transaction?.processorResponseType
    )
      ? `[${response.transaction.processorResponseType}] `
      : '';
    throw new CustomError(500, `${prefix}${response.message}`);
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

export const addPackageTracking = async (
  transactionId: string,
  packageParam: Package
) => {
  const gateway = getBraintreeGateway();
  const transactionGateway = gateway.transaction as TransactionGateway;
  const response = await transactionGateway.packageTracking(
    transactionId,
    packageParam
  );
  logResponse('packageTracking', response);
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
  const gateway = getBraintreeGateway(BRAINTREE_TIMEOUT_CUSTOMER);
  const response = await gateway.customer.find(customerId);
  logResponse('findCustomer', response);
  return response;
};

export const createCustomer = async (
  request: CustomerCreateRequest
): Promise<Customer> => {
  const gateway = getBraintreeGateway(BRAINTREE_TIMEOUT_CUSTOMER);
  const response = await gateway.customer.create(request);
  logResponse('createCustomer', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.customer;
};

export const createPaymentMethod = async (
  request: PaymentMethodCreateRequest
): Promise<PaymentMethod> => {
  const gateway = getBraintreeGateway(BRAINTREE_TIMEOUT_CUSTOMER);
  const response = await gateway.paymentMethod.create(request);
  logResponse('createPaymentMethod', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.paymentMethod;
};

export const deleteCustomer = async (customerId: string): Promise<void> => {
  const gateway = getBraintreeGateway(BRAINTREE_TIMEOUT_CUSTOMER);
  await gateway.customer.delete(customerId);
};

export const findTransaction = async (orderId: string) => {
  const gateway = getBraintreeGateway();
  const stream = gateway.transaction.search((search) => {
    search.orderId().is(orderId);
  });
  const transactions = await streamToTransaction(stream);
  if (transactions.length === 0) {
    throw new CustomError(
      500,
      `could not find transaction with orderId ${orderId}`
    );
  }
  logResponse('findTransaction', transactions);
  return transactions;
};

function streamToTransaction(stream: Stream): Promise<Array<Transaction>> {
  const transactions: Transaction[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (transaction: Transaction) =>
      transactions.push(transaction)
    );
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(transactions));
  });
}

export const deletePayment = async (paymentMethodToken: string) => {
  const gateway = getBraintreeGateway(BRAINTREE_TIMEOUT_CUSTOMER);
  await gateway.paymentMethod.delete(paymentMethodToken);
};

export const updatePayment = async (
  paymentMethodToken: string,
  updateRequest: PaymentMethodUpdateRequest
) => {
  const gateway = getBraintreeGateway(BRAINTREE_TIMEOUT_CUSTOMER);
  const response = await gateway.paymentMethod.update(
    paymentMethodToken,
    updateRequest
  );
  logResponse('updatePaymentMethod', response);
  if (!response.success) {
    throw new CustomError(500, response.message);
  }
  return response.paymentMethod;
};
