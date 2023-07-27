import { Customer } from '@commercetools/platform-sdk';
import { mapCommercetoolsCustomerToBraintreeCustomerCreateRequest } from '../utils/map.utils';
import { logger } from '../utils/logger.utils';
import CustomError from '../errors/custom.error';
import {
  createCustomer,
  createPaymentMethod,
  findCustomer,
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
