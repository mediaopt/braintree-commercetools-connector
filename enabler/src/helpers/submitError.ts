import { GenericError } from "../types";

// An Error carrying our own code, so a rejected submit() tells Checkout which failure it was.
export const codedError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

type SubmitErrorReporters = {
  notify: (type: "Error", text: string) => void;
  onError?: (error: GenericError) => void;
  isLoading: (active: boolean) => void;
};

// A failed submit() reaches the shopper (toast), the merchant (onError) and Checkout (the rejection),
// and takes the loader down.
export const failSubmit = (
  { notify, onError, isLoading }: SubmitErrorReporters,
  reject: (reason: unknown) => void,
  toast: string,
  error: GenericError,
  cause: unknown = codedError(error.code, error.message),
) => {
  notify("Error", toast);
  onError?.(error);
  isLoading(false);
  reject(cause);
};
