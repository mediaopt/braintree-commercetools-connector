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
import { mockCustomTypeLookup } from '../utils/mock-custom-type-lookup';
import { braintreeCustomerCustom, otherTypeCustom } from '../utils/mock-custom-types';
import { getConfig } from '../../src/config/config';
import { log } from '../../src/libs/logger';

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
    mockCustomTypeLookup();
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

  const customerWith = (custom?: object) => ({
    id: 'ct-123',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
    lastModifiedAt: '2024-01-01T00:00:00Z',
    ...(custom ? { custom } : {}),
  });
  // customers().withId().get()/post() chain; returns the post mock to read the sent actions from
  const mockCustomerClient = (customer: object | undefined) => {
    const post = jest.fn().mockReturnValue({
      execute: jest.fn<() => Promise<unknown>>().mockResolvedValue({ body: { ...customer, version: 2 } }),
    });
    const execute = customer
      ? jest.fn<() => Promise<unknown>>().mockResolvedValue({ body: customer })
      : jest.fn<() => Promise<unknown>>().mockRejectedValue({ httpErrorStatus: 404 });
    const get = jest.fn().mockReturnValue({ execute });
    mockCtClient({ customers: jest.fn().mockReturnValue({ withId: jest.fn().mockReturnValue({ get, post }) }) });
    return post;
  };
  const sentActions = (post: jest.Mock) =>
    (post.mock.calls as [{ body: { actions: unknown[] } }][]).map(([args]) => args.body.actions);
  // Braintree's customer lookup misses: the SDK error and its record
  const notFound = Object.assign(new Error('customer not found'), { name: 'notFoundError' });
  const findMiss = {
    findProcessorRequest: '{"customerId":"ct-123"}',
    findResponse: '{"success":false,"name":"notFoundError","message":"customer not found"}',
  };

  describe('linkBraintreeCustomerId', () => {
    test('the same braintreeCustomerId already stored: nothing written', async () => {
      const post = mockCustomerClient(customerWith(braintreeCustomerCustom({ braintreeCustomerId: 'bt-123' })));

      await service.linkBraintreeCustomerId('ct-123', 'bt-123');

      expect(post).not.toHaveBeenCalled();
    });

    test('retries up to 3 times with 1s delay', async () => {
      const post = mockCustomerClient(customerWith());
      // every update fails
      post.mockReturnValue({ execute: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined) });

      const promise = service.linkBraintreeCustomerId('ct-123', 'bt-123');
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      expect(post).toHaveBeenCalledTimes(3);
    });

    test('the record fields of the same request go in the same update', async () => {
      const post = mockCustomerClient(customerWith(braintreeCustomerCustom({})));

      await service.linkBraintreeCustomerId('ct-123', 'bt-123', { findResponse: '{"id":"ct-123"}' });

      expect(sentActions(post)).toEqual([
        [
          { action: 'setCustomField', name: 'findResponse', value: '{"id":"ct-123"}' },
          { action: 'setCustomField', name: 'braintreeCustomerId', value: 'bt-123' },
        ],
      ]);
    });

    describe("by the customer's custom type", () => {
      test('no custom type: sets the Braintree customer type with braintreeCustomerId', async () => {
        const post = mockCustomerClient(customerWith());

        await service.linkBraintreeCustomerId('ct-123', 'bt-123');

        expect(sentActions(post)).toEqual([
          [
            {
              action: 'setCustomType',
              type: { typeId: 'type', key: getConfig().customerTypeKey },
              fields: { braintreeCustomerId: 'bt-123' },
            },
          ],
        ]);
      });

      test('the Braintree customer type: sets only the field', async () => {
        const post = mockCustomerClient(customerWith(braintreeCustomerCustom({ other: 'kept' })));

        await service.linkBraintreeCustomerId('ct-123', 'bt-123');

        expect(sentActions(post)).toEqual([
          [{ action: 'setCustomField', name: 'braintreeCustomerId', value: 'bt-123' }],
        ]);
      });

      // never replaces a merchant's own customer type; no retries
      test('another custom type: nothing written, logged once', async () => {
        const post = mockCustomerClient(customerWith(otherTypeCustom()));
        const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => log);

        await service.linkBraintreeCustomerId('ct-123', 'bt-123');

        expect(post).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ct-123'));
      });
    });

    test('customer not found: nothing written', async () => {
      const post = mockCustomerClient(undefined);

      await service.linkBraintreeCustomerId('ct-missing', 'bt-123');

      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('vaultPaymentMethodForCustomer', () => {
    const vault = (ctCustomerId?: string) =>
      service.vaultPaymentMethodForCustomer({ paymentMethodNonce: 'nonce-123', ctCustomerId });
    // the request's customer writes are fire-and-forget
    const flush = () => jest.advanceTimersByTimeAsync(0);

    beforeEach(() => {
      (CommonConnect.findCustomer as jest.Mock).mockRejectedValue(notFound as never);
    });

    test('no customer on the cart: refused before Braintree', async () => {
      await expect(vault(undefined)).rejects.toThrow(ErrorInvalidOperation);

      expect(CommonConnect.findCustomer).not.toHaveBeenCalled();
    });

    test('CT customer not found: refused before the vault', async () => {
      mockCustomerClient(undefined);

      await expect(vault('ct-missing')).rejects.toThrow(ErrorInvalidOperation);

      expect(CommonConnect.createCustomer).not.toHaveBeenCalled();
      expect(CommonConnect.createPaymentMethod).not.toHaveBeenCalled();
    });

    test('new customer: created with the nonce; the link and both records in one update', async () => {
      const post = mockCustomerClient(customerWith());
      const btCustomer = { id: 'ct-123', paymentMethods: [{ token: 'pm-token-1', verified: true }] };
      (CommonConnect.createCustomer as jest.Mock).mockResolvedValue(btCustomer as never);

      await expect(vault('ct-123')).resolves.toEqual({ token: 'pm-token-1', verified: true, ctCustomerId: 'ct-123' });
      await flush();

      const createRequest = (CommonConnect.createCustomer as jest.Mock).mock.calls[0][0];
      expect(createRequest).toEqual(expect.objectContaining({ paymentMethodNonce: 'nonce-123' }));
      expect(sentActions(post)).toEqual([
        [
          {
            action: 'setCustomType',
            type: { typeId: 'type', key: getConfig().customerTypeKey },
            fields: {
              ...findMiss,
              vaultProcessorRequest: JSON.stringify(createRequest),
              vaultResponse: JSON.stringify(btCustomer),
              braintreeCustomerId: 'ct-123',
            },
          },
        ],
      ]);
    });

    test('self-heal: braintreeCustomerId missing, a matching Braintree customer found — vaulted onto it and re-linked', async () => {
      const post = mockCustomerClient(customerWith(braintreeCustomerCustom({})));
      (CommonConnect.findCustomer as jest.Mock).mockResolvedValue({ id: 'ct-123' } as never);
      (CommonConnect.createPaymentMethod as jest.Mock).mockResolvedValue({ token: 'pm-token-2' } as never);

      await expect(vault('ct-123')).resolves.toEqual({ token: 'pm-token-2', verified: false, ctCustomerId: 'ct-123' });
      await flush();

      expect(CommonConnect.createCustomer).not.toHaveBeenCalled();
      expect(CommonConnect.createPaymentMethod).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'ct-123' }));
      expect(sentActions(post)).toHaveLength(1);
      expect(sentActions(post)[0]).toEqual(
        expect.arrayContaining([
          { action: 'setCustomField', name: 'findResponse', value: '{"id":"ct-123"}' },
          { action: 'setCustomField', name: 'vaultResponse', value: '{"token":"pm-token-2"}' },
          { action: 'setCustomField', name: 'braintreeCustomerId', value: 'ct-123' },
        ]),
      );
    });

    test('known braintreeCustomerId (from the CT customer): vaulted onto it, records written without a link', async () => {
      const post = mockCustomerClient(customerWith(braintreeCustomerCustom({ braintreeCustomerId: 'bt-123' })));
      const paymentMethod = { token: 'pm-token-3', verified: true };
      (CommonConnect.createPaymentMethod as jest.Mock).mockResolvedValue(paymentMethod as never);

      await expect(vault('ct-123')).resolves.toEqual({ token: 'pm-token-3', verified: true, ctCustomerId: 'ct-123' });
      await flush();

      const vaultRequest = (CommonConnect.createPaymentMethod as jest.Mock).mock.calls[0][0];
      expect(vaultRequest).toEqual(
        expect.objectContaining({ customerId: 'bt-123', paymentMethodNonce: 'nonce-123', options: expect.any(Object) }),
      );
      expect(sentActions(post)).toEqual([
        [
          { action: 'setCustomField', name: 'findProcessorRequest', value: findMiss.findProcessorRequest },
          { action: 'setCustomField', name: 'findResponse', value: findMiss.findResponse },
          { action: 'setCustomField', name: 'vaultProcessorRequest', value: JSON.stringify(vaultRequest) },
          { action: 'setCustomField', name: 'vaultResponse', value: JSON.stringify(paymentMethod) },
        ],
      ]);
    });

    test('braintreeCustomerId drift: logged, vaulted onto the stored one', async () => {
      mockCustomerClient(customerWith(braintreeCustomerCustom({ braintreeCustomerId: 'bt-123' })));
      (CommonConnect.findCustomer as jest.Mock).mockResolvedValue({ id: 'ct-123' } as never);
      (CommonConnect.createPaymentMethod as jest.Mock).mockResolvedValue({ token: 'pm-token-4' } as never);
      const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => log);

      await vault('ct-123');
      await flush();

      expect(CommonConnect.createPaymentMethod).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'bt-123' }));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('braintreeCustomerId mismatch for customer ct-123'));
    });

    test("vault fails: Braintree's answer recorded with the lookup, no link, the error rethrown", async () => {
      const post = mockCustomerClient(customerWith(braintreeCustomerCustom({})));
      const decline = { success: false, message: 'Declined' };
      (CommonConnect.createCustomer as jest.Mock).mockRejectedValue(
        CommonConnect.withBraintreeResponse(new CommonConnect.CustomError(500, 'Declined'), decline) as never,
      );

      await expect(vault('ct-123')).rejects.toThrow('Declined');
      await flush();

      expect(sentActions(post)).toHaveLength(1);
      expect(sentActions(post)[0]).toEqual(
        expect.arrayContaining([
          { action: 'setCustomField', name: 'findResponse', value: findMiss.findResponse },
          { action: 'setCustomField', name: 'vaultResponse', value: JSON.stringify(decline) },
        ]),
      );
      expect(sentActions(post)[0]).not.toContainEqual(expect.objectContaining({ name: 'braintreeCustomerId' }));
    });

    test('Braintree returns no payment method: refused', async () => {
      mockCustomerClient(customerWith(braintreeCustomerCustom({ braintreeCustomerId: 'bt-123' })));
      (CommonConnect.createPaymentMethod as jest.Mock).mockResolvedValue(null as never);

      await expect(vault('ct-123')).rejects.toThrow(ErrorInvalidOperation);
      await flush();
    });

    test.each([
      { description: 'verified', paymentMethod: { token: 'pm', verified: true }, verified: true },
      { description: 'verified absent', paymentMethod: { token: 'pm' }, verified: false },
    ])('maps verified: $description', async ({ paymentMethod, verified }) => {
      mockCustomerClient(customerWith(braintreeCustomerCustom({ braintreeCustomerId: 'bt-123' })));
      (CommonConnect.createPaymentMethod as jest.Mock).mockResolvedValue(paymentMethod as never);

      await expect(vault('ct-123')).resolves.toEqual(expect.objectContaining({ verified }));
      await flush();
    });
  });

  // customer-level Braintree calls: what was sent and what Braintree answered, as {name}ProcessorRequest/{name}Response
  describe('recordCustomerCall', () => {
    // fire-and-forget
    const record = async () => {
      service.recordCustomerCall('ct-123', 'find', { customerId: 'ct-123' }, { id: 'ct-123' });
      await jest.advanceTimersByTimeAsync(0);
    };

    test('the Braintree customer type: both fields by setCustomField', async () => {
      const post = mockCustomerClient(customerWith(braintreeCustomerCustom({ braintreeCustomerId: 'ct-123' })));

      await record();

      expect(sentActions(post)).toEqual([
        [
          { action: 'setCustomField', name: 'findProcessorRequest', value: '{"customerId":"ct-123"}' },
          { action: 'setCustomField', name: 'findResponse', value: '{"id":"ct-123"}' },
        ],
      ]);
    });

    test('no custom type: sets the Braintree customer type with both fields', async () => {
      const post = mockCustomerClient(customerWith());

      await record();

      expect(sentActions(post)).toEqual([
        [
          {
            action: 'setCustomType',
            type: { typeId: 'type', key: getConfig().customerTypeKey },
            fields: { findProcessorRequest: '{"customerId":"ct-123"}', findResponse: '{"id":"ct-123"}' },
          },
        ],
      ]);
    });

    // e.g. the same Braintree customer on every checkout load
    test('the same answer already stored: nothing written', async () => {
      const post = mockCustomerClient(
        customerWith(
          braintreeCustomerCustom({ findProcessorRequest: '{"customerId":"ct-123"}', findResponse: '{"id":"ct-123"}' }),
        ),
      );

      await record();

      expect(post).not.toHaveBeenCalled();
    });

    test("another custom type: nothing written, never replaces the merchant's type", async () => {
      const post = mockCustomerClient(customerWith(otherTypeCustom()));

      await record();

      expect(post).not.toHaveBeenCalled();
    });

    // a fire-and-forget rejection would crash the process
    test('the customer read throws: logged, no unhandled rejection', async () => {
      mockCtClient({
        customers: jest.fn(() => {
          throw new Error('client unavailable');
        }),
      });
      const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => log);

      await record();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('find not recorded on customer ct-123'));
    });
  });

  // the caller writes the record together with its other customer writes
  describe('findExistingBraintreeCustomerId', () => {
    test('the found Braintree customer and its record, nothing written', async () => {
      const post = mockCustomerClient(customerWith());
      (CommonConnect.findCustomer as jest.Mock).mockResolvedValue({ id: 'ct-123' } as never);

      await expect(service.findExistingBraintreeCustomerId('ct-123')).resolves.toEqual({
        braintreeCustomerId: 'ct-123',
        recordFields: { findProcessorRequest: '{"customerId":"ct-123"}', findResponse: '{"id":"ct-123"}' },
      });
      expect(post).not.toHaveBeenCalled();
    });

    test('a miss: no id, the SDK error as the record', async () => {
      (CommonConnect.findCustomer as jest.Mock).mockRejectedValue(notFound as never);

      await expect(service.findExistingBraintreeCustomerId('ct-123')).resolves.toEqual({
        braintreeCustomerId: undefined,
        recordFields: findMiss,
      });
    });
  });
});
