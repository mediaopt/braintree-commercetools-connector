import { Client } from "braintree-web";
import { PaymentResult } from "./enabler";
import { ButtonStyleOverrides, GeneralComponentsProps, PerMethodConfig } from "../../types";

export type BaseOptions = Omit<
  GeneralComponentsProps,
  "paymentMethodType" | "builderType"
> & {
  buttonStyleOverrides?: ButtonStyleOverrides;
  braintreeEnvironment?: string;
  storedPaymentMethodsEnabled?: boolean;
  enableVaulting?: boolean;
  perMethodConfig?: PerMethodConfig;
  //optional
  // countryCode?: string;
  // currencyCode?: string;
  // environment: string;
  // paymentMethodConfig?: { [key: string]: string };
  // locale?: string;
  // onComplete: (result: PaymentResult) => void;
  // getStorePaymentDetails: () => boolean;
  // setStorePaymentDetails: (enabled: boolean) => void;
};
