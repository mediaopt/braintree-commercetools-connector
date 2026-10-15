import { Payment } from '@commercetools/connect-payments-sdk';
import { PaymentUpdateAction, Transaction, TransactionType } from '@commercetools/platform-sdk';
import { findSuitableTransactionId } from 'common-connect/dist';

const PLACEHOLDER_PREFIX = 'ACH: ';

// Marker interactionId of the ACH micro-deposit placeholder (addPlaceholderActions below and
// cancelPlaceholderPayment, braintree-payment.service.ts): the vaulted bank account's token, since Braintree has no
// transaction yet — settlement() charges it once the account is verified (docs/Intents.md). It is never a Braintree
// transaction id, so it must never be sent to Braintree as one — find/exclude it via isPlaceholderInteractionId()
// below — and, carrying a payment method token, never logged.
export const buildPlaceholderInteractionId = (vaultToken: string): string => `${PLACEHOLDER_PREFIX}${vaultToken}`;

// The vaulted bank account token carried by a placeholder's marker
export const placeholderVaultToken = (t: Transaction): string | undefined =>
  isPlaceholderInteractionId(t.interactionId)
    ? t.interactionId!.slice(PLACEHOLDER_PREFIX.length) || undefined
    : undefined;

/**
 * Adds the ACH micro-deposit placeholder: an Authorization with the marker interactionId, which
 * updatePaymentWithTransaction (braintree-payment.service.ts) later overwrites in place once the real Braintree
 * transaction exists. Pending, never Initial: commercetools Checkout triggers Order creation from a non-Initial
 * transaction.
 *
 * Only added if the payment has no Authorization yet — neither a placeholder from a prior attempt (a retry after a
 * server-side success the client saw as a transient failure; addTransaction itself has no dedup key) nor a real one
 * already written by transactionSale. Any state counts, since this connector never leaves a failed Authorization on a
 * payment: a declined sale makes the shared transactionSale throw (Braintree success: false) before anything is
 * written to commercetools.
 */
export const addPlaceholderActions = (payment: Payment, vaultToken: string): PaymentUpdateAction[] =>
  payment.transactions.some((t) => t.type === 'Authorization')
    ? []
    : [
        {
          action: 'addTransaction',
          transaction: {
            type: 'Authorization',
            state: 'Pending',
            interactionId: buildPlaceholderInteractionId(vaultToken),
            amount: { centAmount: payment.amountPlanned.centAmount, currencyCode: payment.amountPlanned.currencyCode },
          },
        },
      ];

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
 * True when transactionSale already charged the payment: it always records the sale as an Authorization
 * (transactionTypeOverride), Success or Pending (e.g. ACH settlement). The ACH micro-deposit placeholder isn't a sale.
 */
export const hasSale = (payment: Payment): boolean =>
  payment.transactions.some(
    (t) => t.type === 'Authorization' && (t.state === 'Success' || t.state === 'Pending') && !isPlaceholder(t),
  );

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
