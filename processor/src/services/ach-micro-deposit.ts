import { Customer, Payment } from '@commercetools/connect-payments-sdk';
import { PaymentUpdateAction, TransactionState, TransactionType } from '@commercetools/platform-sdk';
import { PaymentMethod, Transaction } from 'braintree';
import {
  findPaymentMethod,
  getBraintreeResponse,
  mapRequestToBraintreeTransactionSale,
  transactionSale,
} from 'common-connect/dist';

import { PaymentIntentResponseSchemaDTO, PaymentModificationStatus } from '../dtos/operations/payment-intents.dto';
import { log } from '../libs/logger';
import { paymentSDK } from '../payment-sdk';
import { errorMessage, retryCTSync } from '../utils/error.utils';
import { rejectPaymentIntent, toPaymentIntentResponse } from '../utils/paymentIntent.utils';
import {
  buildPlaceholderInteractionId,
  hasCancelledPlaceholder,
  hasOpenPlaceholder,
  isOpenPlaceholder,
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

// For every log about a capture claim that blocks the payment: how the merchant unlocks it (docs/Intents.md
// "ACH micro-deposit verification")
export const CLAIM_MANUAL_RELEASE_HINT =
  "if no capture is running and the Braintree control panel shows no sale for this payment, set the payment's Initial Charge to Failure manually to unlock it";

// The BraintreePaymentService methods used here, passed bound by the service
export interface AchMicroDepositDeps {
  getPayment(paymentId: string): Promise<Payment>;
  getCtCustomer(ctCustomerId: string): Promise<Customer | undefined>;
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
  const reject = (reason: string, level?: 'warn' | 'error') =>
    rejectPaymentIntent(ctPayment.id, 'settlement', reason, level);
  if (hasCancelledPlaceholder(ctPayment)) return reject('the payment was cancelled before verification');
  // One sale settles the whole bank debit, so nothing would be left to capture after a partial one
  if (microDepositAuthorization.amount.centAmount !== amount.centAmount)
    return reject('a partial capture of an ACH micro-deposit payment is not supported');
  if (hasCaptureClaim(ctPayment))
    return reject(`a capture of this payment is already in progress or done — ${CLAIM_MANUAL_RELEASE_HINT}`);
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
    return reject("the placeholder's bank account doesn't belong to the payment's customer", 'error');
  // `verified` is a runtime field on UsBankAccount; @types/braintree does not declare it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((paymentMethod as any).verified !== true)
    return reject(
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
    return reject(
      `the capture could not be claimed on commercetools, another capture may be running — ${errorMessage(err)}`,
      'error',
    );
  }
  return claimedSale(deps, claimed, token);
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
    const rejected = await deps.handleBraintreeFailure({
      ctPayment,
      operation: 'settlement',
      messageName: 'transactionSale',
      request: transactionRequest,
      err,
    });
    // Braintree answered (a decline): no sale exists, so the claim is released for the next capture. Without an
    // answer (timeout, network) the sale may exist, so the claim stays: a payment needing a manual check beats a
    // second debit
    if (getBraintreeResponse(err)) await releaseCaptureClaim(deps, ctPayment.id);
    else
      log.error(
        `settlement: ACH sale outcome unknown on payment ${ctPayment.id} — the capture claim is kept to prevent a second debit; ${CLAIM_MANUAL_RELEASE_HINT}`,
      );
    return rejected;
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
  const result = toPaymentIntentResponse(response);
  // defensive only: Braintree answered with a failed sale, so nothing was debited
  if (result.outcome === PaymentModificationStatus.REJECTED) await releaseCaptureClaim(deps, ctPayment.id);
  return result;
}

// A sale Braintree declined after its claim frees the payment for the next capture: the claim goes to Failure
async function releaseCaptureClaim(deps: AchMicroDepositDeps, paymentId: string): Promise<void> {
  const released = await retryCTSync(
    async () => {
      const payment = await deps.getPayment(paymentId);
      const actions = payment.transactions
        .filter((t) => isOpenPlaceholder(t, 'Charge'))
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
    log.error(`settlement: capture claim of payment ${paymentId} could not be released — ${CLAIM_MANUAL_RELEASE_HINT}`);
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
  // A capture holding its claim is charging (or charged) the bank account, so the payment can't be cancelled
  // commercetools-only anymore. Checked on the payment the write is based on: a claim written in between makes this
  // write fail its version check, and the retry reads the claim.
  let captureClaimed = false;
  const cancelled = await retryCTSync(
    async () => {
      const payment = await deps.getPayment(ctPayment.id);
      if (hasCancelledPlaceholder(payment)) return;
      captureClaimed = hasCaptureClaim(payment);
      if (captureClaimed) return;
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
    return rejectPaymentIntent(ctPayment.id, operation, 'cancellation could not be recorded on commercetools', 'error');
  if (captureClaimed)
    return rejectPaymentIntent(
      ctPayment.id,
      operation,
      `a capture of this payment is in progress or done — ${CLAIM_MANUAL_RELEASE_HINT}`,
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
    const target = recorded.find((r) => isOpenPlaceholder(t, r.type));
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
