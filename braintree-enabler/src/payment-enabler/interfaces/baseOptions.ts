import { Client } from "braintree-web";
import { PaymentResult } from "./enabler";
import { GeneralComponentsProps } from "../../types";

export type BaseOptions = GeneralComponentsProps & {
  //required
  //sdk: Client;

  processorUrl: string;
  sessionId: string;
  merchantAccountId?: string;
  purchaseCallback: (result: PaymentResult) => void;

  //optional
  // countryCode?: string;
  // currencyCode?: string;
  // environment: string;
  // paymentMethodConfig?: { [key: string]: string };
  // locale?: string;
  // onComplete: (result: PaymentResult) => void;
  // onError: (error: any, context?: { paymentReference?: string }) => void;
  // getStorePaymentDetails: () => boolean;
  // setStorePaymentDetails: (enabled: boolean) => void;
};
