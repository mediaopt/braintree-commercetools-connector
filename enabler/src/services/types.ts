import { BuilderType, BraintreeLineItem, BraintreeShipping } from "../types";
import { BraintreePaymentMethodType } from "../components/Builder/types";

export type CreatePaymentRequest = {
  builderType: BuilderType;
  paymentMethodType: BraintreePaymentMethodType;
  merchantAccountId?: string;
};

// Options accepted by handleTransactionSale. Fields mirror processor/src/dtos/braintree-payment.dto.ts
// (TransactionSaleRequestSchemaDTO), minus ctPaymentId and paymentMethodNonce which are added internally.
export type TransactionSaleOptions = {
  braintreeCustomerId?: string;
  paymentToken?: string;
  storeInVaultOnSuccess?: boolean;
  storeShipping?: boolean;
  deviceData?: string;
  localPaymentId?: string;
  venmoUsername?: string;
  paypalOrderId?: string;
  braintreePaymentDetails?: {
    braintreeLineItems?: BraintreeLineItem[];
    extraShippingCost?: string;
    braintreeShipping?: BraintreeShipping;
  };
  shipping?: BraintreeShipping;
  lineItems?: BraintreeLineItem[];
};

export type TransactionSaleRequest = TransactionSaleOptions & {
  ctPaymentId: string;
  paymentMethodNonce?: string;
  paymentMethodType: BraintreePaymentMethodType;
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
  address?: {
    country: string;
    postalCode?: string;
    city?: string;
    region?: string;
  };
};

export type StoredPaymentMethod = {
  id: string;
  type: string;
  token: string;
  isDefault: boolean;
  createdAt: string;
  displayOptions: {
    endDigits?: string;
    brand?: { key: string };
    expiryMonth?: number;
    expiryYear?: number;
    logoUrl?: string;
    email?: string;
  };
};

export type StoredPaymentMethodsResponse = {
  storedPaymentMethods: StoredPaymentMethod[];
};
