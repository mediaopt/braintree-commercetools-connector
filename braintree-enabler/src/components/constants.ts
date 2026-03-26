export const processorUrls = (processorUrl: string) => ({
  createPaymentUrl: `${processorUrl}/payment/createPayment`,
  getClientTokenUrl: `${processorUrl}/payment/getClientToken`,
  purchaseUrl: `${processorUrl}/payment/createPurchase`,
  createPaymentForVault: `${processorUrl}/payment/createPaymentForVault`,
  vaultPaymentMethodUrl: `${processorUrl}/payment/vaultPaymentMethod`,
  saveLocalPaymentIdUrl: `${processorUrl}/payment/setLocalPaymentId`,
  getAchVaultTokenURL: `${processorUrl}/payment/getAchVaultToken`,
});
