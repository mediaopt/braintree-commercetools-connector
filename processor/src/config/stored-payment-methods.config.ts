// import { PaymentMethodType } from '../dtos/braintree-payment.dto'; // only used by commented-out allowedPaymentMethods below
import { getConfig } from './config';

export type StoredPaymentMethodsConfig = {
  enabled: boolean; // indicates if tokenization feature is enabled
  config: {
    paymentInterface: string; // paymentInterface to set
    //interfaceAccount?: string; // optional interfaceAccount to set
    // allowedPaymentMethods was unused config-driven scaffolding;
    // the CreditCard-only restriction requested by commercetools
    // is now hardcoded directly in getStoredPaymentMethods() (braintree-payment.service.ts).
    // allowedPaymentMethods: PaymentMethodType[];
  };
};

let storedPaymentMethodsConfigValidated: StoredPaymentMethodsConfig;

export const getStoredPaymentMethodsConfig = (): StoredPaymentMethodsConfig => {
  if (storedPaymentMethodsConfigValidated) {
    return storedPaymentMethodsConfigValidated;
  }

  storedPaymentMethodsConfigValidated = {
    enabled: getConfig().storedPaymentMethodsEnabled === 'true',
    config: {
      paymentInterface: getConfig().storedPaymentMethodsPaymentInterface,
      //interfaceAccount: getConfig().storedPaymentMethodsInterfaceAccount,
      // allowedPaymentMethods: [PaymentMethodType.CREDIT_CARD],
    },
  };

  return storedPaymentMethodsConfigValidated;
};
