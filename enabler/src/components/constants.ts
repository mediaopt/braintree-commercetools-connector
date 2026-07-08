const PAYMENTS_ROUTE = "/payments";
const CUSTOMER_ROUTE = "/customer";

export const processorUrls = (processorUrl: string) => {
  const paymentsPrefix = `${processorUrl}${PAYMENTS_ROUTE}`;
  // PURE_VAULT_DISABLED const customerPrefix = `${processorUrl}${CUSTOMER_ROUTE}`;
  return {
    createPaymentUrl: `${paymentsPrefix}`,
    expressClientTokenUrl: `${paymentsPrefix}/expressClientToken`,
    transactionSaleUrl: `${paymentsPrefix}/transactionSale`,
    getAchVaultTokenURL: `${paymentsPrefix}/getAchVaultToken`,
    updateCartShippingUrl: `${paymentsPrefix}/updateCartShipping`,
    getStoredPaymentMethodsURL: `${processorUrl}/stored-payment-methods`,
    // PURE_VAULT_DISABLED: pureVaultUrl: `${customerPrefix}/pureVault`,
  };
};
