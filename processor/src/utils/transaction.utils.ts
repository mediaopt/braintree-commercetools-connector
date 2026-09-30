import { ErrorInvalidOperation, Payment } from '@commercetools/connect-payments-sdk';
import { Transaction, TransactionType } from '@commercetools/platform-sdk';
import { findSuitableTransactionId } from 'common-connect/dist';

const PLACEHOLDER_PREFIX = 'BraintreePlaceholder: ';

// Marker interactionId of the ACH micro-deposit placeholder (syncCtPaymentStatus's ensureTransaction and
// cancelPlaceholderPayment, braintree-payment.service.ts), built from the commercetools payment id since Braintree
// has no transaction yet. It is never a Braintree id, so it must never be sent to Braintree — find/exclude it via
// isPlaceholderInteractionId() below.
export const buildPlaceholderInteractionId = (ctPaymentId: string): string => `${PLACEHOLDER_PREFIX}${ctPaymentId}`;

export const isPlaceholderInteractionId = (interactionId?: string): boolean =>
  !!interactionId?.startsWith(PLACEHOLDER_PREFIX);

export const hasPlaceholder = (payment: Payment): boolean =>
  payment.transactions.some((t) => isPlaceholderInteractionId(t.interactionId));

/**
 * Copy of the payment without placeholder transactions — lets the shared common-connect
 * findSuitableTransactionId (unchanged, also used by braintree-extension) never resolve a placeholder marker.
 */
export const withoutPlaceholders = (payment: Payment): Payment => ({
  ...payment,
  transactions: payment.transactions.filter((t) => !isPlaceholderInteractionId(t.interactionId)),
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
export const hasCancelledPlaceholder = (payment: Payment): boolean =>
  payment.transactions.some((t) => t.type === 'CancelAuthorization' && isPlaceholderInteractionId(t.interactionId));

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

/**
 * Resolves the payment's captured (settled) Charge — how much of it is still refundable is
 * remainingRefundableCentAmount's job. Returns undefined when the payment hasn't been captured at all. Throws when more than one captured Charge exists — a Braintree refund
 * targets one specific transaction, so reversing just one of several would misreport the payment as
 * fully reversed. Used by reversePayment's void-vs-refund routing (braintree-payment.service.ts).
 */
export const findCapturedCharge = (payment: Payment): Transaction | undefined => {
  const chargeTransactions = payment.transactions.filter((t) => t.type === 'Charge' && t.state === 'Success');
  if (chargeTransactions.length === 0) {
    return undefined;
  }
  if (chargeTransactions.length > 1) {
    throw new ErrorInvalidOperation(
      `Payment ${payment.id} has more than one captured Charge — reversePayment doesn't support reversing multiple captures; refund each one individually via refundPayment with its transactionId`,
    );
  }
  return chargeTransactions[0];
};
