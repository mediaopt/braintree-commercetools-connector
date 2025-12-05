import { describe, expect } from '@jest/globals';
import {
  createPaymentInteractionAddedSubscription,
  deleteCustomerCreateSubscription,
} from '../src/connector/actions';

describe('Testing actions', () => {
  test('add extension', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({ body: { results: [{}] } })),
    };
    const apiRoot: any = {
      subscriptions: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      delete: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
      post: jest.fn(() => apiRequest),
    };
    await createPaymentInteractionAddedSubscription(
      apiRoot,
      'lorem ipsum',
      'lorem ipsum'
    );
    expect(apiRoot.get).toHaveBeenCalledTimes(1);
    expect(apiRoot.delete).toHaveBeenCalledTimes(1);
    expect(apiRoot.post).toHaveBeenCalledTimes(1);
    expect(apiRequest.execute).toHaveBeenCalledTimes(3);
  });

  test('delete extension', async () => {
    const apiRequest: any = {
      execute: jest.fn(() => ({ body: { results: [{}] } })),
    };
    const apiRoot: any = {
      subscriptions: jest.fn(() => apiRoot),
      withKey: jest.fn(() => apiRoot),
      delete: jest.fn(() => apiRequest),
      get: jest.fn(() => apiRequest),
    };
    await deleteCustomerCreateSubscription(apiRoot);
    expect(apiRoot.get).toHaveBeenCalledTimes(1);
    expect(apiRoot.delete).toHaveBeenCalledTimes(1);
    expect(apiRequest.execute).toHaveBeenCalledTimes(2);
  });
});
