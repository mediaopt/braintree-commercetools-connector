export const BRAINTREE_PAYMENT_TYPE_KEY = "braintree-payment-type";
export const BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY =
  "braintree-payment-interaction-type";

export const BRAINTREE_CUSTOMER_TYPE_KEY = "braintree-customer-type";

export const VAULT_BRAINTREE_OPTIONS = {
  failOnDuplicatePaymentMethod: true,
  usBankAccountVerificationMethod: "network_check",
  verifyCard: process.env.BRAINTREE_VALIDATE_CARD === "true" || undefined,
  verificationMerchantAccountId:
    process.env.BRAINTREE_MERCHANT_ACCOUNT || undefined,
};
