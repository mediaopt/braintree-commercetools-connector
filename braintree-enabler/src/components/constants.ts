const PAYMENTS_ROUTE = "/payments";
const CUSTOMER_ROUTE = "/customer";

export const processorUrls = (processorUrl: string) => {
  const paymentsPrefix = `${processorUrl}${PAYMENTS_ROUTE}`;
  const customerPrefix = `${processorUrl}${CUSTOMER_ROUTE}`;
  return {
    createPaymentUrl: `${paymentsPrefix}`,
    transactionSaleUrl: `${paymentsPrefix}/transactionSale`,
    getAchVaultTokenURL: `${paymentsPrefix}/getAchVaultToken`,
    createPaymentForVault: `${paymentsPrefix}/createPaymentForVault`,
    vaultPaymentMethodUrl: `${paymentsPrefix}/vaultPaymentMethod`,
    saveLocalPaymentIdUrl: `${paymentsPrefix}/setLocalPaymentId`,
    updateCartShippingUrl: `${paymentsPrefix}/updateCartShipping`,
    pureVaultUrl: `${customerPrefix}/pureVault`,
  };
};
