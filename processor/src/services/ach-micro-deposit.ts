import { Customer, Payment } from '@commercetools/connect-payments-sdk';
import { PaymentUpdateAction, TransactionState, TransactionType } from '@commercetools/platform-sdk';
import { PaymentMethod, Transaction } from 'braintree';
import { findPaymentMethod, mapRequestToBraintreeTransactionSale, transactionSale } from 'common-connect/dist';

import { PaymentIntentResponseSchemaDTO, PaymentModificationStatus } from '../dtos/operations/payment-intents.dto';
import { log } from '../libs/logger';
import { paymentSDK } from '../payment-sdk';
import { errorMessage, retryCTSync } from '../utils/error.utils';
import {
  buildPlaceholderInteractionId,
  hasCancelledPlaceholder,
  hasOpenPlaceholder,
  isPlaceholder,
  placeholderVaultToken,
} from '../utils/transaction.utils';
import { ModifyPaymentWithTransactionRequest } from './types/operation.type';

/*
 * ACH micro-deposit placeholder (getAchVaultToken's unverified path): its capture and cancel, kept out of
 * BraintreePaymentService since they concern only that rare flow — see docs/Intents.md "ACH micro-deposit verification".
 * NOT OFFICIALLY SUPPORTED: kept so that such a payment doesn't get stuck at a dead end without any resolution.
 * Merchants who want the micro-deposit flow MUST open an issue to get full support (enabler/README.md#ach).
 */

// docs/Intents.md "ACH micro-deposit verification"
export const CONCURRENT_CANCEL_AND_SALE_ISSUE =
  'merchant integration issue: ct cancel and capture (Braintree transaction.sale) called concurrently';

// The BraintreePaymentService methods used here, passed bound by the service
export interface AchMicroDepositDeps {
  getPayment(paymentId: string): Promise<Payment>;
  getCtCustomer(ctCustomerId: string): Promise<Customer | undefined>;
  rejectPaymentIntent(
    paymentId: string,
    operation: string,
    reason: string,
    level?: 'warn' | 'error',
  ): PaymentIntentResponseSchemaDTO;
  handleBraintreeFailure(args: {
    ctPayment: Payment;
    operation: string;
    messageName: string;
    request: string | object;
    err: unknown;
  }): Promise<PaymentIntentResponseSchemaDTO>;
  updatePaymentWithTransaction(args: {
    messageName: string;
    request: string | object;
    ctPayment: Payment;
    response: Transaction;
    transactionTypeOverride?: TransactionType;
    methodName: string;
  }): Promise<void>;
  toPaymentIntentResponse(response: Transaction): PaymentIntentResponseSchemaDTO;
}

/**
 * Capture of an ACH micro-deposit payment once its bank account is verified: a sale with the vaulted token carried by
 * the placeholder's marker, which then overwrites the placeholder in place. The mandate needs no resending: Braintree
 * keeps it on the vaulted account.
 *
 * Each capture creates a new Braintree sale, so it is claimed on commercetools right before the sale
 * (captureClaimAction): a concurrent capture fails the claim's version check, a later one (also after a sale whose
 * commercetools write failed) finds the claim — neither reaches the sale.
 */
export async function captureMicroDepositAch(
  deps: AchMicroDepositDeps,
  ctPayment: Payment,
  microDepositAuthorization: Payment['transactions'][number],
  amount: ModifyPaymentWithTransactionRequest['amount'],
): Promise<PaymentIntentResponseSchemaDTO> {
  if (hasCancelledPlaceholder(ctPayment))
    return deps.rejectPaymentIntent(ctPayment.id, 'settlement', 'the payment was cancelled before verification');
  // One sale settles the whole bank debit, so nothing would be left to capture after a partial one
  if (microDepositAuthorization.amount.centAmount !== amount.centAmount)
    return deps.rejectPaymentIntent(
      ctPayment.id,
      'settlement',
      'a partial capture of an ACH micro-deposit payment is not supported',
    );
  if (hasCaptureClaim(ctPayment))
    return deps.rejectPaymentIntent(
      ctPayment.id,
      'settlement',
      'a capture of this payment is already in progress or done',
    );
  const token = placeholderVaultToken(microDepositAuthorization)!;
  let paymentMethod: PaymentMethod;
  try {
    paymentMethod = await findPaymentMethod(token);
  } catch (err) {
    return await deps.handleBraintreeFailure({
      ctPayment,
      operation: 'settlement',
      messageName: 'findPaymentMethod',
      request: { token },
      err,
    });
  }
  // @types/braintree declares no UsBankAccount; only a bank account has a routingNumber
  if (!('routingNumber' in paymentMethod) || !(await isPaymentCustomer(deps, ctPayment, paymentMethod)))
    return deps.rejectPaymentIntent(
      ctPayment.id,
      'settlement',
      "the placeholder's bank account doesn't belong to the payment's customer",
      'error',
    );
  // `verified` is a runtime field on UsBankAccount; @types/braintree does not declare it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((paymentMethod as any).verified !== true)
    return deps.rejectPaymentIntent(
      ctPayment.id,
      'settlement',
      'the bank account is not verified yet — the micro-deposit flow is not officially supported, please open an issue if you need official support',
    );
  let claimed: Payment;
  try {
    // the Payment Intents snapshot's version (nothing above writes to the payment), no retry: a re-fetch would defeat
    // the version check
    claimed = (
      await paymentSDK.ctAPI.client
        .payments()
        .withId({ ID: ctPayment.id })
        .post({ body: { version: ctPayment.version, actions: [captureClaimAction(microDepositAuthorization)] } })
        .execute()
    ).body as Payment;
  } catch (err) {
    return deps.rejectPaymentIntent(
      ctPayment.id,
      'settlement',
      `the capture could not be claimed on commercetools, another capture may be running — ${errorMessage(err)}`,
      'error',
    );
  }
  const result = await claimedSale(deps, claimed, token);
  if (result.outcome === PaymentModificationStatus.REJECTED) await releaseCaptureClaim(deps, ctPayment.id);
  return result;
}

/**
 * True while a capture holds its claim, and after it when the sale couldn't be written to commercetools — the payment
 * is being or was charged, so it mustn't be charged again.
 */
const hasCaptureClaim = (payment: Payment): boolean => hasOpenPlaceholder(payment, 'Charge');

// The claim: a Charge carrying the placeholder's marker, overwritten in place by the sale's Charge
const captureClaimAction = (microDepositAuthorization: Payment['transactions'][number]): PaymentUpdateAction => ({
  action: 'addTransaction',
  transaction: {
    type: 'Charge',
    state: 'Initial',
    interactionId: microDepositAuthorization.interactionId,
    amount: {
      centAmount: microDepositAuthorization.amount.centAmount,
      currencyCode: microDepositAuthorization.amount.currencyCode,
    },
  },
});

async function claimedSale(
  deps: AchMicroDepositDeps,
  ctPayment: Payment,
  token: string,
): Promise<PaymentIntentResponseSchemaDTO> {
  const transactionRequest = mapRequestToBraintreeTransactionSale(ctPayment, false, false, undefined, token);
  // options.submitForSettlement is required to be true for ACH
  transactionRequest.options!.submitForSettlement = true;
  let response: Transaction;
  try {
    response = await transactionSale(transactionRequest);
  } catch (err) {
    return await deps.handleBraintreeFailure({
      ctPayment,
      operation: 'settlement',
      messageName: 'transactionSale',
      request: transactionRequest,
      err,
    });
  }
  // Same recording as transactionSale: the Authorization overwrites the placeholder in place, and the Charge Braintree's
  // settlement_pending maps to overwrites the claim (see updatePaymentWithTransaction)
  await deps.updatePaymentWithTransaction({
    messageName: 'transactionSale',
    request: transactionRequest,
    ctPayment,
    response,
    transactionTypeOverride: 'Authorization',
    methodName: 'settlement',
  });
  log.info(`settlement: ACH sale success, paymentId: ${ctPayment.id}`);
  return deps.toPaymentIntentResponse(response);
}

// A sale that failed after its claim frees the payment for the next capture: the claim goes to Failure
async function releaseCaptureClaim(deps: AchMicroDepositDeps, paymentId: string): Promise<void> {
  const released = await retryCTSync(
    async () => {
      const payment = await deps.getPayment(paymentId);
      const actions = payment.transactions
        .filter((t) => isPlaceholder(t, 'Charge') && t.state !== 'Failure')
        .map((t): PaymentUpdateAction => ({ action: 'changeTransactionState', transactionId: t.id, state: 'Failure' }));
      if (!actions.length) return;
      await paymentSDK.ctAPI.client
        .payments()
        .withId({ ID: paymentId })
        .post({ body: { version: payment.version, actions } })
        .execute();
    },
    'releaseCaptureClaim',
    paymentId,
    '', // no Braintree transaction behind the claim
  );
  if (!released)
    log.error(
      `settlement: capture claim of payment ${paymentId} could not be released — set its Initial Charge to Failure manually to allow another capture`,
    );
}

// The Braintree customer id equals the CT customer id by construction; braintreeCustomerId is only read when they differ
async function isPaymentCustomer(
  deps: AchMicroDepositDeps,
  ctPayment: Payment,
  paymentMethod: PaymentMethod,
): Promise<boolean> {
  const ctCustomerId = ctPayment.customer?.id;
  if (!ctCustomerId) return false;
  if (paymentMethod.customerId === ctCustomerId) return true;
  const ctCustomer = await deps.getCtCustomer(ctCustomerId).catch(() => undefined);
  return paymentMethod.customerId === ctCustomer?.custom?.fields?.braintreeCustomerId;
}

/**
 * Cancel of an unverified ACH payment (micro-deposit flow) with no Braintree transaction yet — writes the cancel
 * marker; see docs/Intents.md "ACH micro-deposit verification".
 */
export async function cancelPlaceholderPayment(
  deps: AchMicroDepositDeps,
  ctPayment: Payment,
  operation: string,
): Promise<PaymentIntentResponseSchemaDTO> {
  const cancelled = await retryCTSync(
    async () => {
      const payment = await deps.getPayment(ctPayment.id);
      if (hasCancelledPlaceholder(payment)) return;
      const placeholder = payment.transactions.find((t) => isPlaceholder(t, 'Authorization'));
      if (!placeholder) {
        log.error(`${CONCURRENT_CANCEL_AND_SALE_ISSUE} on payment ${ctPayment.id}`);
      }
      const amount = placeholder?.amount ?? payment.amountPlanned;
      await paymentSDK.ctAPI.client
        .payments()
        .withId({ ID: ctPayment.id })
        .post({
          body: {
            version: payment.version,
            actions: [
              {
                action: 'addTransaction',
                transaction: {
                  type: 'CancelAuthorization',
                  state: 'Success',
                  interactionId: placeholder?.interactionId ?? buildPlaceholderInteractionId(''),
                  amount: { centAmount: amount.centAmount, currencyCode: amount.currencyCode },
                },
              },
            ],
          },
        })
        .execute();
    },
    'cancelPlaceholderPayment',
    ctPayment.id,
    '', // no Braintree transaction behind a placeholder
  );
  if (!cancelled)
    return deps.rejectPaymentIntent(
      ctPayment.id,
      operation,
      'cancellation could not be recorded on commercetools',
      'error',
    );
  log.warn(
    `${operation}: ACH payment cancelled before micro-deposit verification, no Braintree transaction exists — the bank account stays vaulted, paymentId: ${ctPayment.id}. Cancelled commercetools transaction placeholder added to avoid accidental Braintree capture in the future.`,
  );
  return { outcome: PaymentModificationStatus.APPROVED };
}

/**
 * Overwrites the open placeholders of the recorded transactions' types with the real state and Braintree id: the
 * placeholder Authorization and the capture claim's Charge. A released claim (Failure) stays as it is.
 */
export function placeholderOverwriteActions(
  payment: Payment,
  response: Transaction,
  recorded: { type: TransactionType; state: TransactionState }[],
): PaymentUpdateAction[] {
  if (recorded.some((r) => hasOpenPlaceholder(payment, r.type)) && hasCancelledPlaceholder(payment)) {
    log.error(`${CONCURRENT_CANCEL_AND_SALE_ISSUE} on payment ${payment.id}, Braintree transaction ${response.id}`);
  }
  return payment.transactions.flatMap((t): PaymentUpdateAction[] => {
    const target = t.state !== 'Failure' && recorded.find((r) => isPlaceholder(t, r.type));
    if (!target) return [];
    return [
      // commercetools rejects a change to the current state, which would fail the whole update: an ACH sale's
      // settlement_pending maps to Pending, the placeholder's own state
      ...(t.state === target.state
        ? []
        : [{ action: 'changeTransactionState' as const, transactionId: t.id, state: target.state }]),
      { action: 'changeTransactionInteractionId', transactionId: t.id, interactionId: response.id },
    ];
  });
}
