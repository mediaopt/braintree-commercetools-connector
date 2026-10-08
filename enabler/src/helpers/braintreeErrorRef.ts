// What an error shown or logged in the browser may say about a Braintree failure: braintree-web's error
// code (a fixed SDK constant) and Braintree's GraphQL requestId, which merchants can give Braintree
// support to look up the request. Never the SDK message or response data — those may echo a token,
// the address or bank details. Both values are checked against their format so nothing else slips through.
const BRAINTREE_CODE = /^[A-Z0-9_]{1,80}$/;
const REQUEST_ID = /^[\w-]{1,64}$/;

const isBraintreeError = (
  err: unknown,
): err is { code?: unknown; details?: { originalError?: unknown } } =>
  (err as { name?: unknown } | null)?.name === "BraintreeError";

// The requestId sits in the response body that braintree-web nests under details.originalError; it is
// only kept when Braintree answered with a non-2xx status.
const findRequestId = (err: unknown): string | undefined => {
  let current: any = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const requestId = current.extensions?.requestId;
    if (typeof requestId === "string" && REQUEST_ID.test(requestId)) {
      return requestId;
    }
    current = current.details?.originalError;
  }
  return undefined;
};

// `text` is our own description; the Braintree reference is appended when there is one.
export const withBraintreeRef = (text: string, err?: unknown): string => {
  if (!isBraintreeError(err)) return text;
  const refs: string[] = [];
  if (typeof err.code === "string" && BRAINTREE_CODE.test(err.code)) {
    refs.push(`Braintree error code: ${err.code}`);
  }
  const requestId = findRequestId(err);
  if (requestId) refs.push(`Braintree requestId: ${requestId}`);
  return refs.length ? `${text} (${refs.join(", ")})` : text;
};
