import { describe, test, expect } from '@jest/globals';
import { Payment } from '@commercetools/connect-payments-sdk';
import { Transaction } from '@commercetools/platform-sdk';
import {
  buildPlaceholderInteractionId,
  isPlaceholderInteractionId,
  withoutPlaceholders,
  findActiveCharges,
  isFailedOrVoided,
  isPlaceholder,
  remainingOnOnlyCharge,
  sumRefundedCentAmount,
  findTransactionIdOrUndefined,
  hasCancelledPlaceholder,
  hasPlaceholder,
  remainingRefundableCentAmount,
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

  describe('findActiveCharges', () => {
    test('returns Charges that have not failed, ignoring placeholders and other types', () => {
      const pending = transaction({ id: 'c1', type: 'Charge', state: 'Pending', interactionId: 'txn-1' });
      const settled = transaction({ id: 'c2', type: 'Charge', interactionId: 'txn-2' });
      const payment = paymentWith([
        transaction({ id: 'auth' }),
        pending,
        settled,
        transaction({ id: 'c3', type: 'Charge', state: 'Failure', interactionId: 'txn-3' }),
        transaction({ id: 'ph', type: 'Charge', state: 'Pending', interactionId: buildPlaceholderInteractionId('1') }),
      ]);

      expect(findActiveCharges(payment)).toEqual([pending, settled]);
    });
  });

  describe('remainingOnOnlyCharge', () => {
    const amount = transaction({}).amount;
    const charge = transaction({ id: 'c1', type: 'Charge', interactionId: 'txn-1' });

    test('what is left on the only capture after Success and Pending refunds', () => {
      const payment = paymentWith([
        charge,
        transaction({ id: 'r1', type: 'Refund', state: 'Pending', amount: { ...amount, centAmount: 20000 } }),
      ]);
      expect(remainingOnOnlyCharge(payment, 'txn-1')).toBe(100000);
    });

    test('undefined when the target is not the only capture, or there are several', () => {
      expect(remainingOnOnlyCharge(paymentWith([charge]), 'txn-other')).toBeUndefined();
      const second = transaction({ id: 'c2', type: 'Charge', interactionId: 'txn-2' });
      expect(remainingOnOnlyCharge(paymentWith([charge, second]), 'txn-1')).toBeUndefined();
    });
  });

  describe('isFailedOrVoided', () => {
    test.each([
      ['failed Authorization', [transaction({ state: 'Failure', interactionId: 'txn-1' })], true],
      [
        'successful CancelAuthorization',
        [transaction({}), transaction({ type: 'CancelAuthorization', interactionId: 'txn-1' })],
        true,
      ],
      ['successful Authorization', [transaction({ interactionId: 'txn-1' })], false],
      [
        'failed CancelAuthorization',
        [transaction({ type: 'CancelAuthorization', state: 'Failure', interactionId: 'txn-1' })],
        false,
      ],
      ['failed Authorization of another id', [transaction({ state: 'Failure', interactionId: 'txn-2' })], false],
    ])('%s → %s', (_, transactions, expected) => {
      expect(isFailedOrVoided(paymentWith(transactions), 'txn-1')).toBe(expected);
    });
  });

  describe('findTransactionIdOrUndefined', () => {
    test('returns the latest matching interactionId, ignoring placeholders', () => {
      const payment = paymentWith([
        transaction({ id: 'a1', interactionId: 'txn-1' }),
        transaction({ id: 'a2', interactionId: 'txn-2' }),
        transaction({ id: 'ph', state: 'Pending', interactionId: buildPlaceholderInteractionId('123456') }),
      ]);
      expect(findTransactionIdOrUndefined(payment, 'Authorization')).toBe('txn-2');
    });

    test('returns undefined instead of throwing when nothing matches', () => {
      const payment = paymentWith([
        transaction({ id: 'ph', state: 'Pending', interactionId: buildPlaceholderInteractionId('123456') }),
      ]);
      expect(findTransactionIdOrUndefined(payment, 'Authorization')).toBeUndefined();
      expect(findTransactionIdOrUndefined(paymentWith([]), 'Charge')).toBeUndefined();
    });
  });

  describe('hasPlaceholder', () => {
    test('true only when a transaction carries the placeholder marker', () => {
      expect(
        hasPlaceholder(
          paymentWith([transaction({ state: 'Pending', interactionId: buildPlaceholderInteractionId('1') })]),
        ),
      ).toBe(true);
      expect(hasPlaceholder(paymentWith([transaction({ interactionId: 'txn-real' })]))).toBe(false);
    });

    test('with a type: true only for a placeholder of that type', () => {
      const marker = buildPlaceholderInteractionId('1');
      const payment = paymentWith([transaction({ state: 'Pending', interactionId: marker })]);
      expect(hasPlaceholder(payment, 'Authorization')).toBe(true);
      expect(hasPlaceholder(payment, 'CancelAuthorization')).toBe(false);
    });
  });

  describe('isPlaceholder', () => {
    test('true for the marker, optionally only of the given type', () => {
      const placeholder = transaction({ state: 'Pending', interactionId: buildPlaceholderInteractionId('1') });
      expect(isPlaceholder(placeholder)).toBe(true);
      expect(isPlaceholder(placeholder, 'CancelAuthorization')).toBe(false);
      expect(isPlaceholder(transaction({ interactionId: 'txn-real' }))).toBe(false);
    });
  });

  describe('hasCancelledPlaceholder', () => {
    test('true only for a CancelAuthorization carrying the placeholder marker', () => {
      const marker = buildPlaceholderInteractionId('123456');
      expect(
        hasCancelledPlaceholder(paymentWith([transaction({ type: 'CancelAuthorization', interactionId: marker })])),
      ).toBe(true);
      expect(hasCancelledPlaceholder(paymentWith([transaction({ state: 'Pending', interactionId: marker })]))).toBe(
        false,
      );
      expect(
        hasCancelledPlaceholder(paymentWith([transaction({ type: 'CancelAuthorization', interactionId: 'txn-real' })])),
      ).toBe(false);
    });
  });

  describe('remainingRefundableCentAmount', () => {
    const amount = transaction({}).amount;

    test('subtracts Success and Pending refunds, ignores Failure ones', () => {
      const payment = paymentWith([
        transaction({ id: 'r1', type: 'Refund', amount: { ...amount, centAmount: 20000 } }),
        // Braintree refunds stay Pending until they settle — still already refunded
        transaction({ id: 'r2', type: 'Refund', state: 'Pending', amount: { ...amount, centAmount: 30000 } }),
        transaction({ id: 'r3', type: 'Refund', state: 'Failure', amount: { ...amount, centAmount: 50000 } }),
      ]);
      expect(remainingRefundableCentAmount(payment, 120000)).toBe(70000);
    });

    test('is 0 when a still-Pending refund covered the whole capture', () => {
      const payment = paymentWith([transaction({ id: 'r1', type: 'Refund', state: 'Pending' })]);
      expect(remainingRefundableCentAmount(payment, amount.centAmount)).toBe(0);
    });
  });
});
