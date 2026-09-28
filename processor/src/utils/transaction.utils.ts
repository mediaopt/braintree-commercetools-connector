import { ErrorInvalidOperation, Payment } from '@commercetools/connect-payments-sdk';
import { Transaction } from '@commercetools/platform-sdk';

const PLACEHOLDER_PREFIX = 'BraintreePlaceholder: ';

// The only case in this codebase where a transaction's interactionId is not a real Braintree transaction
// id — the ACH micro-deposit placeholder (syncCtPaymentStatus's ensureTransaction, braintree-payment.service.ts)
// is marked this way, using the commercetools payment id (Braintree hands out no identifier before the real
// transactionSale happens), so it can never be mistaken for — or accidentally sent to Braintree as — a genuine
// transaction id. Always find/exclude the placeholder via isPlaceholderInteractionId() below.
export const buildPlaceholderInteractionId = (ctPaymentId: string): string => `${PLACEHOLDER_PREFIX}${ctPaymentId}`;

export const isPlaceholderInteractionId = (interactionId?: string): boolean =>
  !!interactionId?.startsWith(PLACEHOLDER_PREFIX);

/**
 * Copy of the payment without placeholder transactions — lets the shared common-connect
 * findSuitableTransactionId (unchanged, also used by braintree-extension) never resolve a placeholder marker.
 */
export const withoutPlaceholders = (payment: Payment): Payment => ({
  ...payment,
  transactions: payment.transactions.filter((t) => !isPlaceholderInteractionId(t.interactionId)),
});

/**
 * Total cent amount already refunded on the payment. Braintree refunds stay Pending on commercetools until they
 * settle (submitted_for_settlement maps to Pending), so Pending refunds count as refunded too — otherwise a
 * reverse after an unsettled refund would request more than Braintree has left to refund.
 */
export const sumRefundedCentAmount = (payment: Payment): number =>
  payment.transactions
    .filter((t) => t.type === 'Refund' && (t.state === 'Success' || t.state === 'Pending'))
    .reduce((sum, t) => sum + t.amount.centAmount, 0);

/**
 * Resolves the payment's captured (settled) Charge together with how much of it hasn't been refunded yet
 * (its amount minus the Success/Pending Refunds already applied, see sumRefundedCentAmount). Returns undefined
 * when the payment hasn't been captured at all. Throws when more than one captured Charge exists — a Braintree refund
 * targets one specific transaction, so reversing just one of several would misreport the payment as
 * fully reversed. Used by reversePayment's void-vs-refund routing (braintree-payment.service.ts).
 */
export const findCapturedChargeBalance = (
  payment: Payment,
): { transaction: Transaction; remainingAmount: number } | undefined => {
  const chargeTransactions = payment.transactions.filter((t) => t.type === 'Charge' && t.state === 'Success');
  if (chargeTransactions.length === 0) {
    return undefined;
  }
  if (chargeTransactions.length > 1) {
    throw new ErrorInvalidOperation(
      `Payment ${payment.id} has more than one captured Charge — reversePayment doesn't support reversing multiple captures; refund each one individually via refundPayment with its transactionId`,
    );
  }
  const [transaction] = chargeTransactions;
  return {
    transaction,
    remainingAmount: transaction.amount.centAmount - sumRefundedCentAmount(payment),
  };
};
