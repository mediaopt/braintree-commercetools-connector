import { Transaction } from 'braintree';
import { mapBraintreeStatusToCommercetoolsTransactionState } from 'common-connect/dist';

import { PaymentIntentResponseSchemaDTO, PaymentModificationStatus } from '../dtos/operations/payment-intents.dto';
import { log } from '../libs/logger';

/**
 * Rejected answer for an operation impossible in the payment's current state (warn) or after a failure (error) —
 * see docs/Intents.md "How this connector answers".
 */
export const rejectPaymentIntent = (
  paymentId: string,
  operation: string,
  reason: string,
  level: 'warn' | 'error' = 'warn',
): PaymentIntentResponseSchemaDTO => {
  log[level](`${operation}: rejected, paymentId: ${paymentId} — ${reason}`);
  return { outcome: PaymentModificationStatus.REJECTED };
};

// Payment Intents API response — outcome derived from the same CT transaction state written for this Braintree result.
// Failures never get here: see rejectPaymentIntent / handleBraintreeFailure (braintree-payment.service.ts).
export const toPaymentIntentResponse = (response: Transaction): PaymentIntentResponseSchemaDTO => {
  const state = mapBraintreeStatusToCommercetoolsTransactionState(response.status);
  const outcome =
    state === 'Success'
      ? PaymentModificationStatus.APPROVED
      : state === 'Failure'
        ? PaymentModificationStatus.REJECTED
        : PaymentModificationStatus.RECEIVED;
  return { outcome };
};
