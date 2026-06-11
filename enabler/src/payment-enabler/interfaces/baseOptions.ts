import { Client } from "braintree-web";
import { PaymentResult } from "./enabler";
import { ButtonStyleOverrides, GeneralComponentsProps } from "../../types";

export type BaseOptions = Omit<
  GeneralComponentsProps,
  "paymentMethodType" | "builderType"
> & {
  buttonStyleOverrides?: ButtonStyleOverrides;
  braintreeEnvironment?: string;
  //todo - clarify if implement onError here makes sense
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
