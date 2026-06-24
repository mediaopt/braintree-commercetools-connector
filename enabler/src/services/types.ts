import { BuilderType } from "../types";
import { BraintreePaymentMethodType } from "../components/Builder/types";

export type CreatePaymentRequest = {
  builderType: BuilderType;
  paymentMethodType: BraintreePaymentMethodType;
  merchantAccountId?: string;
};

export type TransactionSaleRequest = {
  ctPaymentId: string;
  paymentMethodNonce: string;
  [key: string]: any;
};

/* PURE_VAULT_DISABLED start
export type VaultRequest = {
 ctCustomerId?: string;
 ctCustomerVersion?: string | number;
 ctPaymentId: string;
 braintreeCustomerId: string;
 paymentMethodNonce: string;
};
PURE_VAULT_DISABLED end */

export type ChangeShippingRequest = {
  newShippingMethodId: string;
};
