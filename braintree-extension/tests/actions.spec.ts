import { describe, expect } from '@jest/globals';
import {
  createBraintreeCustomerExtension,
  deleteExtensionIfExist,
  BRAINTREE_EXTENSION_KEY,
  createCustomPaymentTransactionType,
  BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS,
  createCustomPaymentType,
  BRAINTREE_API_PAYMENT_ENDPOINTS,
  BRAINTREE_API_CUSTOMER_ENDPOINTS,
  createCustomCustomerType,
  createBraintreePaymentExtension,
  createCustomPaymentInteractionType,
} from '../src/connector/actions';

describe('Testing actions', () => {
  test.each([
    {
      method: createBraintreeCustomerExtension,
    },
    {
      method: createBraintreePaymentExtension,
    },
  ])('$method', async ({ method }) => {
    const apiRequest: any = {
      execute: jest.fn(() => ({ body: { results: [{}] } })),
    };
    const apiRoot: any = {
      extensions: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      delete: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
      post: jest.fn(() => apiRequest),
    };
    await method(apiRoot, 'https://lorem.ipsum');
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.delete).toBeCalledTimes(1);
    expect(apiRoot.post).toBeCalledTimes(1);
    expect(apiRequest.execute).toBeCalledTimes(3);
  });

  test('delete extension', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({ body: { results: [{}] } })),
    };
    const apiRoot: any = {
      extensions: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      delete: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await deleteExtensionIfExist(apiRoot, BRAINTREE_EXTENSION_KEY);
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.delete).toBeCalledTimes(1);
    expect(apiRequest.execute).toBeCalledTimes(2);
  });

  test.each([
    {
      method: createCustomPaymentTransactionType,
      expectedLength: BRAINTREE_API_PAYMENT_TRANSACTION_ENDPOINTS.length * 2,
    },
    {
      method: createCustomPaymentType,
      expectedLength: BRAINTREE_API_PAYMENT_ENDPOINTS.length * 2 + 2,
    },
    {
      method: createCustomCustomerType,
      expectedLength: BRAINTREE_API_CUSTOMER_ENDPOINTS.length * 2 + 1,
    },
    {
      method: createCustomPaymentInteractionType,
      expectedLength: 3,
    },
  ])('$method', async ({ method, expectedLength }) => {
    const apiRequest: any = {
      execute: jest.fn(() => ({
        body: { results: [{ fieldDefinitions: [] }] },
      })),
    };
    const apiRoot: any = {
      types: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      post: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await method(apiRoot);
    expect(apiRoot.get).toBeCalledTimes(1);
    expect(apiRoot.post).toBeCalledTimes(1);
    expect(apiRequest.execute).toBeCalledTimes(2);
    expect(apiRoot.post.mock.calls[0][0].body.actions).toHaveLength(
      expectedLength
    );
  });
});
