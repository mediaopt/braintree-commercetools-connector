import { logger } from 'common-connect/dist';
import { Transaction } from 'braintree';

// Backoff sleeps 500 + 1000 ms over 3 attempts — sized for buyer-facing calls (e.g. transactionSale), where the whole
// response should stay within ~3 s; CT round trips come on top.
const CT_SYNC_MAX_ATTEMPTS = 3;
const CT_SYNC_BACKOFF_BASE_MS = 500;

// Never stringifies a non-Error: an SDK error object can carry the full failed request/response with data that should remain private.
export const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  const { code, statusCode, message } = (err ?? {}) as Record<string, unknown>;
  const parts = [code, statusCode, message].filter((part) => typeof part === 'string' || typeof part === 'number');
  return parts.length ? parts.join(' ') : 'unknown error';
};

// Logs a warning for each field whose enabler-sent value diverges from what Braintree's own
// response reports for it (e.g. localPaymentId, venmoUsername). A field is skipped if either side
// is missing — a mismatch is only meaningful when both values are actually present.
export const warnOnFieldMismatch = (
  ctPaymentId: string,
  fields: Array<{ fieldName: string; enablerValue: string | undefined; braintreeValue: string | undefined }>,
): void => {
  for (const { fieldName, enablerValue, braintreeValue } of fields) {
    if (enablerValue && braintreeValue && enablerValue !== braintreeValue) {
      logger.warn(`${fieldName} mismatch for payment ${ctPaymentId}`);
    }
  }
};

// Builds the `logOnError` context string passed to retryCTSync from a Braintree transaction response.
export const formatBraintreeSyncContext = (
  response: Pick<Transaction, 'status' | 'orderId' | 'amount'>,
  extra: Array<string | false | undefined> = [],
): string =>
  [response.status, response.orderId && `orderId: ${response.orderId}`, ...extra, `amount: ${response.amount}`]
    .filter(Boolean)
    .join(', ');

// CT SDK (connect-payments-sdk) uses `httpErrorStatus`; raw CT API client uses `statusCode`.
export const getCtErrorKind = (err: unknown): 'auth' | 'not-found' | 'other' => {
  const status = (err as { httpErrorStatus?: number })?.httpErrorStatus ?? (err as { statusCode?: number })?.statusCode;
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not-found';
  return 'other';
};

export async function retryCTSync(
  fn: () => Promise<void>,
  methodName: string,
  paymentId: string,
  logOnError: string,
  maxAttempts = CT_SYNC_MAX_ATTEMPTS,
): Promise<boolean> {
  const stateSuffix = logOnError ? ` [Braintree: ${logOnError}]` : '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      if (attempt > 1) logger.info(`${methodName}: CT sync succeeded on retry ${attempt}, paymentId: ${paymentId}`);
      return true;
    } catch (err) {
      logger.error(
        `${methodName}: CT sync failed (attempt ${attempt}/${maxAttempts}), paymentId: ${paymentId} — ${errorMessage(err)}`,
      );
      const errorKind = getCtErrorKind(err);
      if (errorKind === 'auth') {
        logger.warn(`${methodName}: CT sync skipping retry (auth error), paymentId: ${paymentId}${stateSuffix}`);
        return false;
      }
      if (errorKind === 'not-found') {
        logger.error(
          `${methodName}: CT payment not found after Braintree operation completed (404), paymentId: ${paymentId} — CT state is permanently inconsistent${stateSuffix}`,
        );
        return false;
      }
      if (attempt < maxAttempts)
        await new Promise((resolve) => setTimeout(resolve, CT_SYNC_BACKOFF_BASE_MS * 2 ** (attempt - 1)));
    }
  }
  logger.error(`${methodName}: CT sync exhausted all ${maxAttempts} attempts, paymentId: ${paymentId}${stateSuffix}`);
  return false;
}
