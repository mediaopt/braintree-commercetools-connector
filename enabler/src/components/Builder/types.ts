import { SupportedLocalPaymentTypes } from '../LocalPaymentMethods/types';

export type BraintreePaymentMethodType = SupportedLocalPaymentTypes
  | "ACH"
  | "ApplePay"
  | "CreditCard"
  | "CreditCardStored"
  // | "CreditCardVault" // PURE_VAULT_DISABLED: pure vault cancelled; uncomment to re-enable
  | "GooglePay"
  | "PayPal"
  | "PayPalStored"
  // | "PayPalVault" // PURE_VAULT_DISABLED: pure vault cancelled; uncomment to re-enable
  | "Venmo";

export type BraintreePaymentMethodDropInType = BraintreePaymentMethodType; //todo - check if should be restricted

export type BraintreePaymentMethodExpressType = Extract<
  BraintreePaymentMethodType,
  "PayPal" /* | "PayPalVault" | "CreditCardVault" */ // PURE_VAULT_DISABLED: pure vault cancelled; uncomment to re-enable
>;
