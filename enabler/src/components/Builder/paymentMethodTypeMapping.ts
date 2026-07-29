import { BraintreePaymentMethodType } from "./types";

/**
 * This connector's payment method identifiers (CreditCard, PayPal, GooglePay, etc., declared in
 * ./types.ts) predate this commercetools Checkout-compatible edition — they were the public API
 * of a previously published npm module (braintree-commercetools-client, now discontinued; see
 * the repo root README's "For Existing Users" section). They're kept as-is here so integrators
 * migrating from that module don't have to relearn a new naming convention. This file exists
 * purely to reconcile that legacy naming with commercetools Checkout's own icon-key vocabulary.
 */

/**
 * Reverse of processor's PAYMENT_METHOD_ICON_KEY_MAP (processor/src/utils/paymentMethodIcon.utils.ts):
 * maps commercetools Checkout's icon-key vocabulary back to this connector's own canonical
 * payment method identifiers. Kept in sync manually — the two packages don't share a dependency
 * for this constant. Unlike the processor's map this one isn't total over BraintreePaymentMethodType
 * (that type also structurally includes other braintree-web local payment strings this connector
 * doesn't configure/offer); it only needs entries for methods commercetools could plausibly send.
 */
const CT_ICON_KEY_TO_PAYMENT_METHOD_TYPE: Record<string, BraintreePaymentMethodType> = {
  card: "CreditCard",
  paypal: "PayPal",
  googlepay: "GooglePay",
  applepay: "ApplePay",
  // commercetools has two Bancontact icon variants ("bancontactcard" / "bancontactmobile") but this
  // connector only has one generic "bancontact" local payment method. At the moment "card" is selected as
  // the correct variant; "bancontactmobile" remains a possible alternative if that changes.
  bancontactcard: "bancontact",
  przelewy24: "p24",
  ideal: "ideal", // identity — already matches commercetools
  eps: "eps", // identity — already matches commercetools
  blik: "blik", // identity — already matches commercetools
  // Venmo, ACH, and mybank have no commercetools icon-key equivalent today — no entry needed here,
  // they fall through to the pass-through default below. commercetools has been informed of this
  // gap and plans to add icons for these eventually — when they do, real entries will need to be
  // added here instead of relying on the fallback. CreditCardStored is never sent as an incoming
  // `type` either — it's reached via a hardcoded literal inside createStoredPaymentMethodBuilder
  // once "card"/"CreditCard" normalizes, not via this lookup — see payment-enabler-braintree.ts.
  // PAYPAL_STORED_DISABLED: PayPalStored cancelled — see Builder/types.ts and RenderTemplate.tsx;
  // please open an issue if you are interested in this stored payment method.
};

/**
 * Normalizes an incoming `type` string — which may be a commercetools icon key, or (for methods
 * with no commercetools equivalent, or direct/dev-harness usage) already our own canonical
 * value — into our canonical BraintreePaymentMethodType. Permissive pass-through: an
 * unrecognized string is assumed to already be canonical.
 */
export const toBraintreePaymentMethodType = (type: string): BraintreePaymentMethodType =>
  CT_ICON_KEY_TO_PAYMENT_METHOD_TYPE[type] ?? (type as BraintreePaymentMethodType);
