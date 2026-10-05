import { describe, test, expect } from '@jest/globals';
import { handleCustomFieldResponse, handleCustomTransactionFields } from '../../src/utils/customEntities.utils';
import { CustomFieldsDraft, Payment } from '@commercetools/connect-payments-sdk';
import { Transaction } from 'braintree';

// Mirrors the (unexported) RestrictedFields alias in customEntities.utils.ts —
// handleCustomTransactionFields requires `fields` to always be present, not optional.
type RestrictedFields = Required<CustomFieldsDraft>;

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

  describe('handleCustomFieldResponse', () => {
    test('returns response with string message', () => {
      const result = handleCustomFieldResponse('transactionSale', 'test message', basePayment);
      expect(result).toEqual({
        type: {
          typeId: 'type',
          key: 'braintree-payment-type',
        },
        fields: {
          transactionSaleResponse: '"test message"',
        },
      });
    });

    test.each([
      { description: 'stringifies an object message', message: { id: 'tx-123' }, expected: '{"id":"tx-123"}' },
      { description: 'returns an empty string without message', message: undefined, expected: '' },
    ])('$description', ({ message, expected }) => {
      expect(handleCustomFieldResponse('transactionSale', message, basePayment).fields.transactionSaleResponse).toBe(
        expected,
      );
    });
  });

  describe('handleCustomTransactionFields', () => {
    const localPayment = { paymentInstrumentType: 'local_payment', localPayment: { paymentId: 'local-pay-456' } };

    // The guards check the PAYMENT's existing custom fields, not updateActions — so preconditions live on
    // `payment.custom.fields`, and updateActions always starts empty.
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
        ? { ...basePayment, custom: { type: { typeId: 'type', id: 'type-1' }, fields: existingFields } }
        : basePayment;
      const updateActions: RestrictedFields = { type: { typeId: 'type' }, fields: {} };
      const transaction = { id: 'tx-123', status: 'authorized', type: 'sale', amount: '100.00', ...response };

      handleCustomTransactionFields(updateActions, transaction as unknown as Transaction, payment);

      expect(updateActions.fields).toEqual(expected);
    });
  });
});
