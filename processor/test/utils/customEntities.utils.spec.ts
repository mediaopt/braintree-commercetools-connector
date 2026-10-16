import { describe, test, expect, jest, afterEach } from '@jest/globals';
import {
  getTypeId,
  braintreeFailure,
  braintreePaymentCustom as newBraintreePaymentCustom,
  buildCallFields,
  buildPspInteractions,
  buildResponseActions,
  handleCustomTransactionFields,
  isBraintreePayment,
} from '../../src/utils/customEntities.utils';
import { Payment } from '@commercetools/connect-payments-sdk';
import { Transaction } from 'braintree';
import { CustomError, withBraintreeResponse } from 'common-connect/dist';
import { getConfig } from '../../src/config/config';
import { paymentSDK } from '../../src/payment-sdk';
import { BRAINTREE_PAYMENT_TYPE_ID, braintreePaymentCustom, otherTypeCustom } from './mock-custom-types';

describe('customEntities.utils', () => {
  const basePayment: Payment = {
    id: 'payment-123',
    version: 1,
    amountPlanned: { type: 'centPrecision', currencyCode: 'USD', centAmount: 10000, fractionDigits: 2 },
    paymentMethodInfo: { method: 'CreditCard' },
    paymentStatus: {},
    transactions: [],
    interfaceInteractions: [],
    createdAt: '2024-01-01T00:00:00Z',
    lastModifiedAt: '2024-01-01T00:00:00Z',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('buildCallFields', () => {
    test.each([
      { description: 'stores a string message as is', message: 'test message', expected: 'test message' },
      { description: 'stringifies an object message', message: { id: 'tx-123' }, expected: '{"id":"tx-123"}' },
      { description: 'returns an empty string without message', message: undefined, expected: '' },
    ])('$description', ({ message, expected }) => {
      expect(buildCallFields('transactionSale', message, message)).toEqual({
        transactionSaleProcessorRequest: expected,
        transactionSaleResponse: expected,
      });
    });
  });

  describe('braintreeFailure', () => {
    test("Braintree's own response kept on the thrown error", () => {
      const response = { success: false, message: 'Declined', transaction: { id: 'tx-1' } };
      const err = withBraintreeResponse(new CustomError(500, 'Declined'), response);

      expect(braintreeFailure(err)).toBe(response);
    });

    test('an SDK error without a Braintree response: as received', () => {
      const err = new Error('not found');
      err.name = 'notFoundError';

      expect(braintreeFailure(err)).toEqual({ success: false, name: 'notFoundError', message: 'not found' });
    });

    test('a non-Error', () => {
      expect(braintreeFailure('boom')).toEqual({ success: false, message: 'boom' });
    });
  });

  describe('buildPspInteractions', () => {
    const config = getConfig();
    const defaultKey = config.interactionTypeKey;
    afterEach(() => {
      config.interactionTypeKey = defaultKey;
    });

    test("uses the processor's configured interaction type key", () => {
      config.interactionTypeKey = 'custom-interaction-type';

      expect(buildPspInteractions('void', { transactionId: 'tx-1' }, 'ok')).toEqual([
        {
          type: { typeId: 'type', key: 'custom-interaction-type' },
          fields: { type: 'voidProcessorRequest', data: '{"transactionId":"tx-1"}', timestamp: expect.any(String) },
        },
        {
          type: { typeId: 'type', key: 'custom-interaction-type' },
          fields: { type: 'voidResponse', data: 'ok', timestamp: expect.any(String) },
        },
      ]);
    });
  });

  describe('buildResponseActions', () => {
    test('one setCustomField per field (both call fields and extra fields) plus the interaction pair', () => {
      const actions = buildResponseActions(
        'refund',
        { transactionId: 'tx-1' },
        { id: 'tx-2' },
        { BraintreeOrderId: 'o-1' },
      );

      expect(actions).toEqual([
        { action: 'setCustomField', name: 'refundProcessorRequest', value: '{"transactionId":"tx-1"}' },
        { action: 'setCustomField', name: 'refundResponse', value: '{"id":"tx-2"}' },
        { action: 'setCustomField', name: 'BraintreeOrderId', value: 'o-1' },
        expect.objectContaining({
          action: 'addInterfaceInteraction',
          fields: expect.objectContaining({ type: 'refundProcessorRequest', data: '{"transactionId":"tx-1"}' }),
        }),
        expect.objectContaining({
          action: 'addInterfaceInteraction',
          fields: expect.objectContaining({ type: 'refundResponse', data: '{"id":"tx-2"}' }),
        }),
      ]);
    });

    test('never replaces the custom type (no setCustomType)', () => {
      expect(buildResponseActions('void', {}, {}).map((a) => a.action)).not.toContain('setCustomType');
    });
  });

  describe('braintreePaymentCustom', () => {
    test('the Braintree payment type by key, for a new payment draft', () => {
      expect(newBraintreePaymentCustom({})).toEqual({
        type: { typeId: 'type', key: 'braintree-payment-type' },
        fields: {},
      });
    });
  });

  describe('isBraintreePayment', () => {
    test.each([
      { description: 'the Braintree type', custom: braintreePaymentCustom(), expected: true },
      {
        description: 'another type',
        custom: otherTypeCustom(),
        expected: false,
      },
      { description: 'no custom type', custom: undefined, expected: false },
    ])('payment with $description → $expected', ({ custom, expected }) => {
      expect(isBraintreePayment({ ...basePayment, custom }, BRAINTREE_PAYMENT_TYPE_ID)).toBe(expected);
    });
  });

  describe('getTypeId', () => {
    // the cache is per type key, so each test uses its own key
    test('looks the type up once per key, then serves it from the cache', async () => {
      const getByKey = jest
        .spyOn(paymentSDK.ctCustomTypeService, 'getByKey')
        .mockResolvedValue({ id: 'id-1' } as never);

      expect(await getTypeId('cached-key')).toBe('id-1');
      expect(await getTypeId('cached-key')).toBe('id-1');
      expect(getByKey).toHaveBeenCalledTimes(1);
    });

    test('a failed lookup is not cached', async () => {
      const getByKey = jest
        .spyOn(paymentSDK.ctCustomTypeService, 'getByKey')
        .mockRejectedValueOnce(new Error('unavailable'))
        .mockResolvedValue({ id: 'id-1' } as never);

      await expect(getTypeId('retried-key')).rejects.toThrow('unavailable');
      expect(await getTypeId('retried-key')).toBe('id-1');
      expect(getByKey).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleCustomTransactionFields', () => {
    const localPayment = { paymentInstrumentType: 'local_payment', localPayment: { paymentId: 'local-pay-456' } };

    // The guards check the PAYMENT's existing custom fields, not the fields being built — so preconditions live on
    // `payment.custom.fields`, and the built fields always start empty.
    test.each([
      {
        description: 'sets LocalPaymentMethodsPaymentId for local_payment, no BraintreeOrderId without orderId',
        response: localPayment,
        existingFields: undefined,
        expected: { LocalPaymentMethodsPaymentId: 'local-pay-456' },
      },
      {
        description: 'does not overwrite an existing LocalPaymentMethodsPaymentId',
        response: localPayment,
        existingFields: { LocalPaymentMethodsPaymentId: 'existing-id' },
        expected: {},
      },
      {
        description: 'ignores local_payment without paymentId',
        response: { paymentInstrumentType: 'local_payment' },
        existingFields: undefined,
        expected: {},
      },
      {
        description: 'ignores a paymentId for payment instrument types other than local_payment',
        response: { ...localPayment, paymentInstrumentType: 'credit_card' },
        existingFields: undefined,
        expected: {},
      },
      {
        description: 'sets BraintreeOrderId when not already set',
        response: { orderId: 'order-789' },
        existingFields: undefined,
        expected: { BraintreeOrderId: 'order-789' },
      },
      {
        description: 'does not overwrite an existing BraintreeOrderId',
        response: { orderId: 'new-order-789' },
        existingFields: { BraintreeOrderId: 'existing-order' },
        expected: {},
      },
    ])('$description', ({ response, existingFields, expected }) => {
      const payment: Payment = existingFields
        ? { ...basePayment, custom: braintreePaymentCustom(existingFields) }
        : basePayment;
      const fields: Record<string, string> = {};
      const transaction = { id: 'tx-123', status: 'authorized', type: 'sale', amount: '100.00', ...response };

      handleCustomTransactionFields(fields, transaction as unknown as Transaction, payment);

      expect(fields).toEqual(expected);
    });
  });
});
