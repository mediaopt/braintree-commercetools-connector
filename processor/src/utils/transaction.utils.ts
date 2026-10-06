import { Payment } from '@commercetools/connect-payments-sdk';
import { PaymentUpdateAction, Transaction, TransactionState, TransactionType } from '@commercetools/platform-sdk';
import { findSuitableTransactionId } from 'common-connect/dist';

const PLACEHOLDER_PREFIX = 'BraintreePlaceholder: ';

// Marker interactionId of the ACH micro-deposit placeholder (syncCtPaymentStatus's ensureTransaction and
// cancelPlaceholderPayment, braintree-payment.service.ts), built from the commercetools payment id since Braintree
// has no transaction yet. It is never a Braintree id, so it must never be sent to Braintree — find/exclude it via
// isPlaceholderInteractionId() below.
export const buildPlaceholderInteractionId = (ctPaymentId: string): string => `${PLACEHOLDER_PREFIX}${ctPaymentId}`;

export const isPlaceholderInteractionId = (interactionId?: string): boolean =>
  !!interactionId?.startsWith(PLACEHOLDER_PREFIX);

export const isPlaceholder = (t: Transaction, type?: TransactionType): boolean =>
  (!type || t.type === type) && isPlaceholderInteractionId(t.interactionId);

// Any placeholder, or only one of the given transaction type
export const hasPlaceholder = (payment: Payment, type?: TransactionType): boolean =>
  payment.transactions.some((t) => isPlaceholder(t, type));

/**
 * Copy of the payment without placeholder transactions — lets the shared common-connect
 * findSuitableTransactionId (unchanged, also used by braintree-extension) never resolve a placeholder marker.
 */
export const withoutPlaceholders = (payment: Payment): Payment => ({
  ...payment,
  transactions: payment.transactions.filter((t) => !isPlaceholder(t)),
});

/**
 * Placeholder-free findSuitableTransactionId that returns undefined instead of throwing when no matching transaction
 * exists — the shared common-connect function stays throwing for braintree-extension; processor callers decide
 * themselves what "not found" means.
 */
export const findTransactionIdOrUndefined = (payment: Payment, type: TransactionType): string | undefined => {
  try {
    return findSuitableTransactionId({ payment: withoutPlaceholders(payment) }, type);
  } catch {
    return undefined;
  }
};

/**
 * True when an unverified ACH payment's placeholder was cancelled (cancelPlaceholderPayment,
 * braintree-payment.service.ts) — such a payment must never be charged afterwards.
 */
export const hasCancelledPlaceholder = (payment: Payment): boolean => hasPlaceholder(payment, 'CancelAuthorization');

/**
 * Total cent amount already refunded on the payment. Braintree refunds stay Pending on commercetools until they
 * settle (submitted_for_settlement maps to Pending), so Pending refunds count as refunded too — otherwise a
 * reverse after an unsettled refund would request more than Braintree has left to refund.
 */
export const sumRefundedCentAmount = (payment: Payment): number =>
  payment.transactions
    .filter((t) => t.type === 'Refund' && (t.state === 'Success' || t.state === 'Pending'))
    .reduce((sum, t) => sum + t.amount.centAmount, 0);

/** How much of a captured amount hasn't been refunded yet (≤ 0 means fully refunded). */
export const remainingRefundableCentAmount = (payment: Payment, capturedCentAmount: number): number =>
  capturedCentAmount - sumRefundedCentAmount(payment);

// Captures still in play: no placeholder, not Failure (e.g. voided) — see docs/Intents.md
export const findActiveCharges = (payment: Payment): Transaction[] =>
  withoutPlaceholders(payment).transactions.filter((t) => t.type === 'Charge' && t.state !== 'Failure');

// commercetools-only "already refunded" pre-check, only when the target is the payment's only capture — see docs/Intents.md
export const remainingOnOnlyCharge = (payment: Payment, transactionId: string): number | undefined => {
  const charges = findActiveCharges(payment);
  if (charges.length !== 1 || charges[0].interactionId !== transactionId) return undefined;
  return remainingRefundableCentAmount(payment, charges[0].amount.centAmount);
};

// commercetools-only pre-check: the target already failed (declined sale) or was voided — see docs/Intents.md
export const isFailedOrVoided = (payment: Payment, transactionId: string): boolean =>
  payment.transactions.some(
    (t) =>
      t.interactionId === transactionId &&
      ((t.type === 'Authorization' && t.state === 'Failure') ||
        (t.type === 'CancelAuthorization' && t.state === 'Success')),
  );

const ALLOWED_STATE_CHANGES: Record<TransactionState, TransactionState[]> = {
  Initial: ['Pending', 'Success', 'Failure'],
  Pending: ['Success', 'Failure'],
  Failure: ['Success'],
  Success: ['Failure'],
};

/**
 * What ctPaymentService.updatePayment({ transaction }) sends (connect-payments-sdk consolidateTransactionChanges), for
 * the transactions this processor records — always with a Braintree interactionId — so it can go into one raw CT call:
 * the transaction of that type and interactionId gets the new state when the SDK allows the change, otherwise
 * it's added (timestamp = now, as the SDK does).
 */
export const buildTransactionActions = (
  payment: Payment,
  transaction: {
    type: TransactionType;
    amount: { centAmount: number; currencyCode: string };
    interactionId?: string;
    state: TransactionState;
  },
): PaymentUpdateAction[] => {
  const matching = payment.transactions.filter(
    (t) => t.type === transaction.type && !!transaction.interactionId && t.interactionId === transaction.interactionId,
  );
  if (matching.length > 1)
    throw new Error(
      `Multiple matching transactions found for payment ${payment.id}: ${transaction.type} ${transaction.interactionId}`,
    );
  const [existing] = matching;
  if (!existing)
    return [
      {
        action: 'addTransaction',
        transaction: {
          type: transaction.type,
          amount: { centAmount: transaction.amount.centAmount, currencyCode: transaction.amount.currencyCode },
          interactionId: transaction.interactionId,
          state: transaction.state,
          timestamp: new Date().toISOString(),
        },
      },
    ];
  return existing.state !== transaction.state && ALLOWED_STATE_CHANGES[existing.state].includes(transaction.state)
    ? [{ action: 'changeTransactionState', transactionId: existing.id, state: transaction.state }]
    : [];
};
