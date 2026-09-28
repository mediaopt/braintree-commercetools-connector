import { describe, test, expect } from '@jest/globals';
import { ErrorInvalidOperation, Payment } from '@commercetools/connect-payments-sdk';
import { Transaction } from '@commercetools/platform-sdk';
import {
  buildPlaceholderInteractionId,
  isPlaceholderInteractionId,
  withoutPlaceholders,
  findCapturedChargeBalance,
  sumRefundedCentAmount,
} from '../../src/utils/transaction.utils';
import { mockGetPaymentResultWithoutTransactions } from './mock-payment-results';

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  type: 'Authorization',
  state: 'Success',
  amount: { type: 'centPrecision', currencyCode: 'GBP', centAmount: 120000, fractionDigits: 2 },
  timestamp: '2024-01-01T00:00:00Z',
  ...overrides,
});

const paymentWith = (transactions: Transaction[]): Payment => ({
  ...mockGetPaymentResultWithoutTransactions,
  transactions,
});

describe('transaction.utils', () => {
  describe('placeholder interactionId marker', () => {
    test('builds a prefixed marker from the commercetools payment id', () => {
      expect(buildPlaceholderInteractionId('payment-123')).toBe('BraintreePlaceholder: payment-123');
    });

    test('recognizes only its own marker', () => {
      expect(isPlaceholderInteractionId(buildPlaceholderInteractionId('payment-123'))).toBe(true);
      expect(isPlaceholderInteractionId('txn-test-1')).toBe(false);
      expect(isPlaceholderInteractionId(undefined)).toBe(false);
    });
  });

  describe('withoutPlaceholders', () => {
    test('drops placeholder transactions and keeps the rest, without mutating the payment', () => {
      const placeholder = transaction({
        id: 'ph',
        state: 'Pending',
        interactionId: buildPlaceholderInteractionId('123456'),
      });
      const real = transaction({ id: 'real', interactionId: 'txn-test-1' });
      const payment = paymentWith([real, placeholder]);

      expect(withoutPlaceholders(payment).transactions).toEqual([real]);
      expect(payment.transactions).toHaveLength(2);
    });
  });

  describe('sumRefundedCentAmount', () => {
    test('sums Success and Pending Refunds, ignoring Failure/Initial Refunds and other transaction types', () => {
      const refund = (id: string, state: Transaction['state'], centAmount: number) =>
        transaction({ id, type: 'Refund', state, amount: { ...transaction({}).amount, centAmount } });
      const payment = paymentWith([
        transaction({ id: 'charge', type: 'Charge' }),
        refund('r-success', 'Success', 10000),
        refund('r-pending', 'Pending', 20000),
        refund('r-failure', 'Failure', 40000),
        refund('r-initial', 'Initial', 80000),
      ]);

      expect(sumRefundedCentAmount(payment)).toBe(30000);
    });

    test('returns 0 when there are no refunds', () => {
      expect(sumRefundedCentAmount(paymentWith([transaction({ type: 'Charge' })]))).toBe(0);
    });
  });

  describe('findCapturedChargeBalance', () => {
    test('returns undefined when there is no successful Charge', () => {
      const payment = paymentWith([transaction({}), transaction({ type: 'Charge', state: 'Pending' })]);
      expect(findCapturedChargeBalance(payment)).toBeUndefined();
    });

    test('returns the Charge and its amount minus Success and Pending Refunds', () => {
      const charge = transaction({ id: 'charge', type: 'Charge', interactionId: 'txn-test-1' });
      const payment = paymentWith([
        charge,
        transaction({ id: 'r1', type: 'Refund', amount: { ...charge.amount, centAmount: 20000 } }),
        // Braintree refunds stay Pending until they settle — still already refunded
        transaction({ id: 'r2', type: 'Refund', state: 'Pending', amount: { ...charge.amount, centAmount: 30000 } }),
        transaction({ id: 'r3', type: 'Refund', state: 'Failure', amount: { ...charge.amount, centAmount: 50000 } }),
      ]);

      expect(findCapturedChargeBalance(payment)).toEqual({ transaction: charge, remainingAmount: 70000 });
    });

    test('remaining amount is 0 when a still-Pending refund covered the whole Charge', () => {
      const charge = transaction({ id: 'charge', type: 'Charge' });
      const payment = paymentWith([charge, transaction({ id: 'r1', type: 'Refund', state: 'Pending' })]);

      expect(findCapturedChargeBalance(payment)?.remainingAmount).toBe(0);
    });

    test('throws when more than one Charge was captured', () => {
      const payment = paymentWith([
        transaction({ id: 'c1', type: 'Charge' }),
        transaction({ id: 'c2', type: 'Charge' }),
      ]);
      expect(() => findCapturedChargeBalance(payment)).toThrow(ErrorInvalidOperation);
    });
  });
});
