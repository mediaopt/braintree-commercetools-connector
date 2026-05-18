export type BraintreePaymentMethodType =
  | "ACH"
  | "ApplePay"
  | "CreditCard"
  | "CreditCardVault"
  | "GooglePay"
  | "LocalPaymentMethod"
  | "PayPal"
  | "PayPalVault"
  | "Venmo";

export type BraintreePaymentMethodDropInType = BraintreePaymentMethodType; //todo - check if should be restricted

export type BraintreePaymentMethodExpressType = Extract<
  BraintreePaymentMethodType,
  "PayPal" | "PayPalVault" | "CreditCardVault"
>;
