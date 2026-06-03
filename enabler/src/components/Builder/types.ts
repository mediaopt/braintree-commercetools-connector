import { SupportedLocalPaymentTypes } from '../LocalPaymentMethods/types';

export type BraintreePaymentMethodType = SupportedLocalPaymentTypes
  | "ACH"
  | "ApplePay"
  | "CreditCard"
  | "CreditCardVault"
  | "GooglePay"
  | "PayPal"
  | "PayPalVault"
  | "Venmo";

export type BraintreePaymentMethodDropInType = BraintreePaymentMethodType; //todo - check if should be restricted

export type BraintreePaymentMethodExpressType = Extract<
  BraintreePaymentMethodType,
  "PayPal" | "PayPalVault" | "CreditCardVault"
>;
