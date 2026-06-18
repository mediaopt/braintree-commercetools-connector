import { SupportedLocalPaymentTypes } from '../LocalPaymentMethods/types';

export type BraintreePaymentMethodType = SupportedLocalPaymentTypes
  | "ACH"
  | "ApplePay"
  | "CreditCard"
  | "CreditCardStored"
  | "CreditCardVault"
  | "GooglePay"
  | "PayPal"
  | "PayPalStored"
  | "PayPalVault"
  | "Venmo";

export type BraintreePaymentMethodDropInType = BraintreePaymentMethodType; //todo - check if should be restricted

export type BraintreePaymentMethodExpressType = Extract<
  BraintreePaymentMethodType,
  "PayPal" | "PayPalVault" | "CreditCardVault"
>;
