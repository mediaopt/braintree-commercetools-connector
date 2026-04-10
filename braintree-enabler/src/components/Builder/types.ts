export type BraintreePaymentMethodType =
  | "ACH"
  | "ApplePay"
  | "CreditCard"
  | "GooglePay"
  | "LocalPaymentMethod"
  | "PayPal"
  | "Venmo";

export type BraintreePaymentMethodDropInType = BraintreePaymentMethodType; //todo - check if should be restricted

export type BraintreePaymentMethodExpressType = Extract<
  BraintreePaymentMethodType,
  "PayPal"
>;
