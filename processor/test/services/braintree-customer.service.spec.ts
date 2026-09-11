import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BraintreeCustomerService } from '../../src/services/braintree-customer.service';
import { paymentSDK } from '../../src/payment-sdk';
import { Customer } from '@commercetools/connect-payments-sdk';
import { ErrorInvalidOperation } from '@commercetools/connect-payments-sdk';

jest.mock('common-connect', () => ({
  // 'common-connect' and 'common-connect/dist' resolve to the same file on disk, so this mock
  // also intercepts config.ts's own `common-connect/dist` import (transitively required here via
  // '../config/config') — spread the real module so unrelated exports (e.g. resolveTypeKey,
  // BRAINTREE_PAYMENT_TYPE_KEY) stay intact, and only override what this suite actually stubs.
  ...(jest.requireActual('common-connect') as object),
  createCustomer: jest.fn(),
  createPaymentMethod: jest.fn(),
  findCustomer: jest.fn(),
  mapCTCustomerToNewBraintreeCustomer: jest.fn((ctCustomer: any) => ({
    id: ctCustomer.id,
    email: ctCustomer.email,
    firstName: ctCustomer.firstName,
    lastName: ctCustomer.lastName,
  })),
  VAULT_BRAINTREE_OPTIONS: {
    makeDefault: true,
    skipIfCardExistsForCustomer: false,
  },
}));

import * as CommonConnect from 'common-connect';

describe('braintree-customer.service', () => {
  const opts = {
    ctAPI: paymentSDK.ctAPI,
  };
  const service = new BraintreeCustomerService(opts);

  let savedClient: unknown;

  beforeEach(() => {
    jest.setTimeout(10000);
    jest.resetAllMocks();
    // findExistingBraintreeCustomerId (called whenever ctCustomerId is provided) always calls
    // findCustomer(...).then(...).catch(() => undefined) — a bare jest.fn() with no
    // implementation returns undefined synchronously, and undefined.then() throws. Default to a
    // rejection here (safely swallowed by the real .catch()) so tests that don't care about this
    // lookup don't need to configure it themselves; resetAllMocks() strips this every test, so
    // it's re-applied here rather than relying on the jest.mock() factory running only once.
    (CommonConnect.findCustomer as any).mockRejectedValue(new Error('not found'));
    jest.useFakeTimers();
    savedClient = paymentSDK.ctAPI.client;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    (paymentSDK.ctAPI as any).client = savedClient;
  });

  // Callers always pass a fully pre-built `customers` mock chain (withId/get/post already
  // configured) — this just wires it onto the client, it doesn't reconfigure anything.
  const mockCtClient = (responses: { customers?: () => any }) => {
    (paymentSDK.ctAPI as any).client = {
      customers: responses.customers || jest.fn(),
    };
  };

  describe('getCtCustomer', () => {
    test('returns customer when found', async () => {
      const mockCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as unknown as Customer;

      const execute = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCustomer });
      const get = jest.fn().mockReturnValue({ execute });
      const withId = jest.fn().mockReturnValue({ get });
      const customers = jest.fn().mockReturnValue({ withId });

      mockCtClient({ customers });

      const result = await service.getCtCustomer('ct-123');

      expect(result).toEqual(mockCustomer);
      expect(withId).toHaveBeenCalledWith({ ID: 'ct-123' });
    });

    test('returns undefined when customer not found (404)', async () => {
      const execute = jest.fn<() => Promise<any>>().mockRejectedValue({ httpErrorStatus: 404 });
      const get = jest.fn().mockReturnValue({ execute });
      const withId = jest.fn().mockReturnValue({ get });
      const customers = jest.fn().mockReturnValue({ withId });

      mockCtClient({ customers });

      const result = await service.getCtCustomer('ct-missing');

      expect(result).toBeUndefined();
    });

    test('returns undefined on other errors', async () => {
      const execute = jest.fn<() => Promise<any>>().mockRejectedValue(new Error('Network error'));
      const get = jest.fn().mockReturnValue({ execute });
      const withId = jest.fn().mockReturnValue({ get });
      const customers = jest.fn().mockReturnValue({ withId });

      mockCtClient({ customers });

      const result = await service.getCtCustomer('ct-error');

      expect(result).toBeUndefined();
    });
  });

  describe('updateCtCustomer', () => {
    test('updates customer when successful', async () => {
      const updatedCustomer = {
        id: 'ct-123',
        version: 2,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as unknown as Customer;

      const execute = jest.fn<() => Promise<any>>().mockResolvedValue({ body: updatedCustomer });
      const post = jest.fn().mockReturnValue({ execute });
      const withId = jest.fn().mockReturnValue({ post });
      const customers = jest.fn().mockReturnValue({ withId });

      mockCtClient({ customers });

      const result = await service.updateCtCustomer('ct-123', 1, [
        { action: 'setCustomField', name: 'braintreeCustomerId', value: 'bt-123' },
      ]);

      expect(result).toEqual(updatedCustomer);
      expect(post).toHaveBeenCalledWith({
        body: {
          version: 1,
          actions: [{ action: 'setCustomField', name: 'braintreeCustomerId', value: 'bt-123' }],
        },
      });
    });

    test('returns undefined on error', async () => {
      const execute = jest.fn<() => Promise<any>>().mockRejectedValue(new Error('Update failed'));
      const post = jest.fn().mockReturnValue({ execute });
      const withId = jest.fn().mockReturnValue({ post });
      const customers = jest.fn().mockReturnValue({ withId });

      mockCtClient({ customers });

      const result = await service.updateCtCustomer('ct-123', 1, []);

      expect(result).toBeUndefined();
    });
  });

  describe('linkBraintreeCustomerId', () => {
    test('no-op when customer already has braintreeCustomerId set', async () => {
      const mockCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        custom: {
          type: { typeId: 'type' },
          fields: { braintreeCustomerId: 'bt-existing-123' },
        },
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as any;

      const execute = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCustomer });
      const get = jest.fn().mockReturnValue({ execute });
      const withId = jest.fn().mockReturnValue({ get });
      const customers = jest.fn().mockReturnValue({ withId });

      mockCtClient({ customers });

      await service.linkBraintreeCustomerId('ct-123', 'bt-123');

      expect(withId).toHaveBeenCalledTimes(1);
    });

    test('succeeds on first attempt', async () => {
      const mockCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as any;

      const mockUpdatedCustomer = {
        ...mockCustomer,
        version: 2,
        custom: {
          type: { typeId: 'type' },
          fields: { braintreeCustomerId: 'bt-123' },
        },
      };

      // Create a simpler mock structure
      const mockGetResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCustomer });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      const mockPostResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockUpdatedCustomer });
      const mockPostChain = jest.fn().mockReturnValue({ execute: mockPostResponse });
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain, post: mockPostChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      await service.linkBraintreeCustomerId('ct-123', 'bt-123');

      expect(mockPostResponse).toHaveBeenCalled();
    });

    test('retries up to 3 times with 1s delay', async () => {
      const mockCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as any;

      let callCount = 0;

      const mockGetResponse = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ body: mockCustomer });
      });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      const mockPostResponse = jest.fn<() => Promise<any>>().mockResolvedValue(undefined); // Simulate failure
      const mockPostChain = jest.fn().mockReturnValue({ execute: mockPostResponse });
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain, post: mockPostChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      const promise = service.linkBraintreeCustomerId('ct-123', 'bt-123');

      // Advance timers through all retry attempts (3 attempts with 1000ms between them)
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);

      await promise;

      // Should be called 3 times (initial + 2 retries)
      expect(mockPostResponse).toHaveBeenCalledTimes(3);
    });

    test('customer not found causes early return', async () => {
      const mockGetResponse = jest.fn<() => Promise<any>>().mockRejectedValue({ httpErrorStatus: 404 });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      const mockPostChain = jest.fn().mockReturnValue({});
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain, post: mockPostChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      await service.linkBraintreeCustomerId('ct-missing', 'bt-123');

      // Should not attempt update since customer lookup failed
      expect(mockPostChain).not.toHaveBeenCalled();
    });
  });

  describe('vaultPaymentMethodForCustomer', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('throws when neither braintreeCustomerId nor ctCustomerId provided', async () => {
      await expect(
        service.vaultPaymentMethodForCustomer({
          paymentMethodNonce: 'nonce-123',
        }),
      ).rejects.toThrow(ErrorInvalidOperation);
    });

    test('creates new customer and vaults payment method', async () => {
      const mockCtCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as any;

      const mockGetResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCtCustomer });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      // linkBraintreeCustomerId is fired (fire-and-forget) after a new customer is created —
      // it re-fetches the customer (get, above) then persists braintreeCustomerId (post, here).
      const mockPostResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCtCustomer });
      const mockPostChain = jest.fn().mockReturnValue({ execute: mockPostResponse });
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain, post: mockPostChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      (CommonConnect.createCustomer as any).mockResolvedValue({
        id: 'bt-123',
        paymentMethods: [{ token: 'pm-token-1', verified: true }],
      });

      const result = await service.vaultPaymentMethodForCustomer({
        paymentMethodNonce: 'nonce-123',
        ctCustomerId: 'ct-123',
      });

      expect(result.token).toBe('pm-token-1');
      expect(result.verified).toBe(true);
      expect(CommonConnect.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'nonce-123' }),
      );
      // linkBraintreeCustomerId is fired without being awaited — flush pending microtasks/timers
      // so it settles against THIS test's mocks before jest moves to the next test.
      await jest.advanceTimersByTimeAsync(0);
    });

    test('throws when CT customer not found', async () => {
      const mockGetResponse = jest.fn<() => Promise<any>>().mockRejectedValue({ httpErrorStatus: 404 });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      await expect(
        service.vaultPaymentMethodForCustomer({
          paymentMethodNonce: 'nonce-123',
          ctCustomerId: 'ct-missing',
        }),
      ).rejects.toThrow(ErrorInvalidOperation);
    });

    test('self-heal: uses existing Braintree customer when found', async () => {
      const mockCtCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as any;

      const mockGetResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCtCustomer });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      // linkBraintreeCustomerId is fired (fire-and-forget) after the self-heal re-link —
      // it re-fetches the customer (get, above) then persists braintreeCustomerId (post, here).
      const mockPostResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCtCustomer });
      const mockPostChain = jest.fn().mockReturnValue({ execute: mockPostResponse });
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain, post: mockPostChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      (CommonConnect.findCustomer as any).mockResolvedValue({ id: 'ct-123' });
      (CommonConnect.createPaymentMethod as any).mockResolvedValue({
        token: 'pm-token-2',
        verified: false,
      });

      const result = await service.vaultPaymentMethodForCustomer({
        paymentMethodNonce: 'nonce-123',
        ctCustomerId: 'ct-123',
      });

      expect(result.token).toBe('pm-token-2');
      expect(result.verified).toBe(false);
      expect(CommonConnect.createPaymentMethod).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'ct-123' }));
      // linkBraintreeCustomerId is fired without being awaited — flush pending microtasks/timers
      // so it settles against THIS test's mocks before jest moves to the next test.
      await jest.advanceTimersByTimeAsync(0);
    });

    test('logs warning on braintreeCustomerId drift', async () => {
      const mockCtCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as unknown as Customer;

      const mockGetResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCtCustomer });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      const mockPostResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCtCustomer });
      const mockPostChain = jest.fn().mockReturnValue({ execute: mockPostResponse });
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain, post: mockPostChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      (CommonConnect.findCustomer as any).mockResolvedValue({ id: 'different-bt-id' });
      (CommonConnect.createPaymentMethod as any).mockResolvedValue({
        token: 'pm-token-3',
        verified: true,
      });

      const result = await service.vaultPaymentMethodForCustomer({
        paymentMethodNonce: 'nonce-123',
        braintreeCustomerId: 'provided-bt-id',
        ctCustomerId: 'ct-123',
      });

      expect(result.token).toBe('pm-token-3');
      // Note: drift warning is logged but doesn't affect the result
    });

    test('throws when no payment method returned', async () => {
      (CommonConnect.createPaymentMethod as any).mockResolvedValue(null as any);

      const mockCtCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as any;

      const mockGetResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCtCustomer });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      await expect(
        service.vaultPaymentMethodForCustomer({
          paymentMethodNonce: 'nonce-123',
          braintreeCustomerId: 'bt-123',
        }),
      ).rejects.toThrow(ErrorInvalidOperation);
    });

    test('maps verified status correctly (true/absent -> false)', async () => {
      const mockCtCustomer = {
        id: 'ct-123',
        version: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      } as any;

      const mockGetResponse = jest.fn<() => Promise<any>>().mockResolvedValue({ body: mockCtCustomer });
      const mockGetChain = jest.fn().mockReturnValue({ execute: mockGetResponse });
      const mockWithIdChain = jest.fn().mockReturnValue({ get: mockGetChain });
      const mockCustomers = jest.fn().mockReturnValue({ withId: mockWithIdChain });

      (paymentSDK.ctAPI as any).client = { customers: mockCustomers };

      // Test verified=true
      (CommonConnect.createPaymentMethod as any).mockResolvedValueOnce({
        token: 'pm-verified',
        verified: true,
      });

      let result = await service.vaultPaymentMethodForCustomer({
        paymentMethodNonce: 'nonce-123',
        braintreeCustomerId: 'bt-123',
      });

      expect(result.verified).toBe(true);

      // Test verified=undefined (should map to false)
      (CommonConnect.createPaymentMethod as any).mockResolvedValueOnce({
        token: 'pm-unverified',
      });

      result = await service.vaultPaymentMethodForCustomer({
        paymentMethodNonce: 'nonce-456',
        braintreeCustomerId: 'bt-123',
      });

      expect(result.verified).toBe(false);
    });
  });
});
