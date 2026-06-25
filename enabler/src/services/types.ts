import { BuilderType, BraintreeLineItem, BraintreeShipping } from "../types";
import { BraintreePaymentMethodType } from "../components/Builder/types";

export type CreatePaymentRequest = {
  builderType: BuilderType;
  paymentMethodType: BraintreePaymentMethodType;
  merchantAccountId?: string;
};

// Options accepted by handleTransactionSale. Fields mirror processor/src/dtos/braintree-payment.dto.ts
// (TransactionSaleRequestSchemaDTO), minus ctPaymentId and paymentMethodNonce which are added internally.
// account, billing, shipping, lineItems are forwarded in the request body but are not yet declared in
// the processor DTO — they are silently stripped by Fastify validation. See TODO in
// processor/src/services/braintree-payment.service.ts transactionSale ("handle other params").
export type TransactionSaleOptions = {
  braintreeCustomerId?: string;
  paymentToken?: string;
  storeInVaultOnSuccess?: boolean;
  storeShipping?: boolean;
  deviceData?: string;
  localPaymentId?: string;
  venmoUsername?: string;
  braintreePaymentDetails?: {
    braintreeLineItems?: BraintreeLineItem[];
    extraShippingCost?: string;
    braintreeShipping?: BraintreeShipping;
  };
  // Not yet wired on the processor side:
  account?: { email?: string };
  billing?: {
    firstName?: string;
    lastName?: string;
    streetName?: string;
    streetNumber?: string;
    city?: string;
    country?: string;
    postalCode?: string;
  };
  shipping?: BraintreeShipping;
  lineItems?: BraintreeLineItem[];
};

export type TransactionSaleRequest = TransactionSaleOptions & {
  ctPaymentId: string;
  paymentMethodNonce?: string;
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
