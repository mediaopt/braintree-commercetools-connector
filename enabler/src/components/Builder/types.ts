import { SupportedLocalPaymentTypes } from "../LocalPaymentMethods/types";

export type BraintreePaymentMethodType =
  | SupportedLocalPaymentTypes
  | "ACH" // no commercetools icon-key equivalent — see Builder/paymentMethodTypeMapping.ts
  // | "ACHStored" // ACH_STORED_DISABLED: reusing a saved ACH account is out of scope for this build; uncomment to re-enable
  | "ApplePay"
  | "CreditCard"
  | "CreditCardStored"
  // | "CreditCardVault" // PURE_VAULT_DISABLED: pure vault cancelled; uncomment to re-enable
  | "GooglePay"
  | "PayPal"
  // | "PayPalStored" // PAYPAL_STORED_DISABLED: PayPal stored cancelled; uncomment to re-enable
  // | "PayPalVault" // PURE_VAULT_DISABLED: pure vault cancelled; uncomment to re-enable
  | "Venmo"; // no commercetools icon-key equivalent — see Builder/paymentMethodTypeMapping.ts

export type BraintreePaymentMethodExpressType = Extract<
  BraintreePaymentMethodType,
  "PayPal" /* | "PayPalVault" | "CreditCardVault" */ // PURE_VAULT_DISABLED: pure vault cancelled; uncomment to re-enable
>;
