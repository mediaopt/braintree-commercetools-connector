type ErrorItem = {
  statusCode: number | string;
  message: string;
  referencedBy?: string;
};

export class CustomError extends Error {
  statusCode: number | string;
  message: string;
  errors?: ErrorItem[];

  constructor(
    statusCode: number | string,
    message: string,
    errors?: ErrorItem[],
  ) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    if (errors) {
      this.errors = errors;
    }
  }
}

// Braintree's own failure response, kept on the thrown error so a caller can record it. Non-enumerable, so
// JSON.stringify(error) and error middlewares output exactly what they did before.
export const withBraintreeResponse = <T extends Error>(
  error: T,
  response: unknown,
): T =>
  Object.defineProperty(error, "braintreeResponse", {
    value: response,
    enumerable: false,
  });

export const getBraintreeResponse = (error: unknown): unknown =>
  error instanceof Error
    ? (error as Error & { braintreeResponse?: unknown }).braintreeResponse
    : undefined;
