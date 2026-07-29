import { PaymentMethodType } from '../dtos/braintree-payment.dto';

/**
 * Maps every payment method this connector supports to the lowercase icon-key string
 * commercetools Checkout's frontend matches to auto-render a payment-method icon. Methods with
 * no commercetools equivalent (ACH, Venmo, mybank) and the stored variants (never advertised via
 * getSupportedPaymentComponents) map to their own value as an identity entry, commented below.
 * This is a total Record over PaymentMethodType on purpose — adding a new payment method without
 * an entry here is a compile error, so the icon mapping can't silently be forgotten.
 * Cross-reference: enabler/src/components/Builder/paymentMethodTypeMapping.ts keeps the reverse
 * of this table — kept in sync manually, the two packages don't share a dependency for it.
 */
const PAYMENT_METHOD_ICON_KEY_MAP: Record<PaymentMethodType, string> = {
  [PaymentMethodType.CREDIT_CARD]: 'card',
  [PaymentMethodType.PAYPAL]: 'paypal',
  [PaymentMethodType.GOOGLE_PAY]: 'googlepay',
  [PaymentMethodType.APPLE_PAY]: 'applepay',
  [PaymentMethodType.VENMO]: PaymentMethodType.VENMO, // no commercetools icon-key equivalent
  [PaymentMethodType.ACH]: PaymentMethodType.ACH, // no commercetools icon-key equivalent
  // commercetools has two Bancontact icon variants ("bancontactcard" / "bancontactmobile") but this
  // connector only has one generic "bancontact" local payment method. At the moment "card" is selected as
  // the correct variant; "bancontactmobile" remains a possible alternative if that changes.
  [PaymentMethodType.BANCONTACT]: 'bancontactcard',
  [PaymentMethodType.P24]: 'przelewy24',
  [PaymentMethodType.IDEAL]: PaymentMethodType.IDEAL, // identity — already matches commercetools
  [PaymentMethodType.EPS]: PaymentMethodType.EPS, // identity — already matches commercetools
  [PaymentMethodType.BLIK]: PaymentMethodType.BLIK, // identity — already matches commercetools
  [PaymentMethodType.MYBANK]: PaymentMethodType.MYBANK, // no commercetools icon-key equivalent
  // Never advertised via getSupportedPaymentComponents (stored methods aren't listed there) — maps
  // the same as CreditCard since the stored variant is distinguished by using a separate builder
  // (createStoredPaymentMethodBuilder), not by a different type string; kept for Record completeness.
  [PaymentMethodType.CREDIT_CARD_STORED]: 'card',
  // PAYPAL_STORED_DISABLED: [PaymentMethodType.PAYPAL_STORED]: 'paypal',
};

/** Returns the commercetools Checkout icon-key string for a given PaymentMethodType. */
export const toPaymentMethodIconKey = (type: PaymentMethodType): string => PAYMENT_METHOD_ICON_KEY_MAP[type];
