import { GenericError } from "../types";

// An Error carrying our own code, so a rejected submit() tells Checkout which failure it was.
export const codedError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

type SubmitErrorReporters = {
  notify: (type: "Error" | "Warning", text: string) => void;
  onError?: (error: GenericError) => void;
  isLoading: (active: boolean) => void;
};

// A failed submit() reaches the shopper (toast), the merchant (onError) and Checkout (the returned
// error, to throw or reject with), and takes the loader down.
// isWarning only changes the toast: the payment still fails, but the shopper is invited to try again
// (e.g. with another payment method) rather than told the operation can't work at all.
export const reportSubmitError = (
  { notify, onError, isLoading }: SubmitErrorReporters,
  toast: string,
  error: GenericError,
  isWarning = false,
  cause: unknown = codedError(error.code, error.message),
) => {
  isLoading(false);
  notify(isWarning ? "Warning" : "Error", toast);
  onError?.(error);
  return cause;
};

// reportSubmitError for a submit() promise's executor.
export const failSubmit = (
  reporters: SubmitErrorReporters,
  reject: (reason: unknown) => void,
  toast: string,
  error: GenericError,
  cause?: unknown,
) => reject(reportSubmitError(reporters, toast, error, false, cause));

// handleTransactionSale already showed its toast and rejects with a coded error; a component paid
// through Checkout's own button also reports that failure to onError before passing it on.
export const reportSaleFailure = <T>(
  sale: Promise<T>,
  onError?: (error: GenericError) => void,
) =>
  sale.catch((error) => {
    onError?.({ code: error.code, message: error.message });
    throw error;
  });
