import { Customer } from '@commercetools/platform-sdk';
import { mapCommercetoolsCustomerToBraintreeCustomerCreateRequest } from '../utils/map.utils';
import { logger } from '../utils/logger.utils';
import CustomError from '../errors/custom.error';
import {
  createCustomer,
  createPaymentMethod,
  findCustomer,
  deletePayment,
  updatePayment,
} from './braintree.service';
import { handleCustomerResponse, handleError } from '../utils/response.utils';
import {
  CustomerResponse,
  PaymentMethodCreateRequest,
} from '../types/index.types';
import { CustomerCreateRequest } from 'braintree';

function parseVaultRequest(
  customer: Customer
): PaymentMethodCreateRequest | CustomerCreateRequest {
  const { vaultRequest, braintreeCustomerId } = customer?.custom?.fields || {};
  let request: PaymentMethodCreateRequest;
  try {
    request = JSON.parse(vaultRequest) as PaymentMethodCreateRequest;
  } catch (e) {
    request = {
      paymentMethodNonce: vaultRequest,
    } as PaymentMethodCreateRequest;
  }
  if (braintreeCustomerId) {
    request = {
      ...request,
      customerId: braintreeCustomerId,
      options: {
        failOnDuplicatePaymentMethod: true,
        usBankAccountVerificationMethod: 'network_check',
        verifyCard: process.env.BRAINTREE_VALIDATE_CARD === 'true' || undefined,
        verificationMerchantAccountId:
          process.env.BRAINTREE_MERCHANT_ACCOUNT || undefined,
      },
    };
    return request;
  } else {
    return mapCommercetoolsCustomerToBraintreeCustomerCreateRequest(
      customer,
      JSON.stringify(request)
    ) as CustomerCreateRequest;
  }
}

export async function handleFindRequest(
  findRequest: string,
  customer: Customer
) {
  if (!findRequest) {
    return [];
  }
  const request = JSON.parse(findRequest);

  try {
    const customerId =
      request?.customerId ??
      customer?.custom?.fields?.braintreeCustomerId ??
      customer.id;
    logger.info(`findCustomer request: ${customerId}`);
    const response = await findCustomer(customerId);
    return handleCustomerResponse('find', response, customer);
  } catch (e) {
    logger.error('Call to find customer resulted in an error', e);
    return handleError('find', e);
  }
}

export async function handleCreateRequest(
  customer: Customer,
  createRequest: string
) {
  if (!createRequest) {
    return [];
  }
  try {
    const request = mapCommercetoolsCustomerToBraintreeCustomerCreateRequest(
      customer,
      createRequest
    );
    logger.info(`createCustomer request: ${JSON.stringify(request)}`);
    if (!request.id) {
      throw new CustomError(400, 'field customerId is missing');
    }
    const response = await createCustomer(request);
    return handleCustomerResponse('create', response, customer);
  } catch (e) {
    logger.error('Call to create customer resulted in an error', e);
    return handleError('create', e);
  }
}

export async function handleVaultRequest(customer: Customer) {
  if (!customer?.custom?.fields?.vaultRequest) {
    return [];
  }
  try {
    const request = parseVaultRequest(customer);
    let response: CustomerResponse;
    if (!customer?.custom?.fields?.braintreeCustomerId) {
      logger.info(`createCustomer request: ${JSON.stringify(request)}`);
      response = await createCustomer(request);
    } else {
      logger.info(`createPaymentMethod request: ${JSON.stringify(request)}`);
      response = await createPaymentMethod(<PaymentMethodCreateRequest>request);
    }
    return handleCustomerResponse('vault', response, customer);
  } catch (e) {
    logger.error('Call to vault resulted in an error', e);
    return handleError('vault', e);
  }
}

export async function handleDeletePaymentRequest(
  deletePaymentRequest: string,
  customer: Customer
) {
  if (!deletePaymentRequest) {
    return [];
  }

  try {
    logger.info(`deletePayment request: ${deletePaymentRequest}`);
    await deletePayment(deletePaymentRequest);
    return handleCustomerResponse('deletePayment', 'success', customer);
  } catch (e) {
    logger.error('Call to delete payment resulted in an error', e);
    return handleError('deletePayment', e);
  }
}

export const handleUpdatePaymentRequest = async (
  updatePaymentMethodRequest: string,
  customer: Customer
) => {
  if (!updatePaymentMethodRequest) {
    return [];
  }
  try {
    const request = JSON.parse(
      updatePaymentMethodRequest
    ) as PaymentMethodCreateRequest & { paymentMethodToken?: string };
    logger.info(`updatePayment request: ${request}`);
    const paymentMethodToken = request.paymentMethodToken;
    if (!paymentMethodToken) {
      throw new CustomError(500, 'parameter paymentMethodToken is missing');
    }
    request.paymentMethodToken = undefined;
    const response = await updatePayment(paymentMethodToken, request);
    return handleCustomerResponse('updatePayment', response, customer);
  } catch (e) {
    logger.error('Call to update payment resulted in an error', e);
    return handleError('updatePayment', e);
  }
};
