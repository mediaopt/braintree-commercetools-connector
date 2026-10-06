import { jest } from '@jest/globals';
import { paymentSDK } from '../../src/payment-sdk';
import { getConfig } from '../../src/config/config';
import { BRAINTREE_CUSTOMER_TYPE_ID, BRAINTREE_PAYMENT_TYPE_ID } from './mock-custom-types';

const typeIdsByKey: Record<string, string> = {
  [getConfig().paymentTypeKey]: BRAINTREE_PAYMENT_TYPE_ID,
  [getConfig().customerTypeKey]: BRAINTREE_CUSTOMER_TYPE_ID,
};

// Stubs the type lookup — the only real commercetools call behind getTypeId (cached per process afterwards)
export const mockCustomTypeLookup = () =>
  jest
    .spyOn(paymentSDK.ctCustomTypeService, 'getByKey')
    .mockImplementation(async ({ key }) => ({ id: typeIdsByKey[key] }) as never);
