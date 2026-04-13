const PAYMENTS_ROUTE = "/payments";

export const processorUrls = (processorUrl: string) => {
  const paymentsPrefix = `${processorUrl}${PAYMENTS_ROUTE}`;
  return {
    createPaymentUrl: `${paymentsPrefix}`,
    transactionSaleUrl: `${paymentsPrefix}/transactionSale`,
    getAchVaultTokenURL: `${paymentsPrefix}/getAchVaultToken`,
    createPaymentForVault: `${paymentsPrefix}/createPaymentForVault`,
    vaultPaymentMethodUrl: `${paymentsPrefix}/vaultPaymentMethod`,
    saveLocalPaymentIdUrl: `${paymentsPrefix}/setLocalPaymentId`,
  };
};
