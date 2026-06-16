import { LocalPaymentTypes } from "braintree-web/local-payment";

export type SupportedLocalPaymentTypes = Exclude<
  LocalPaymentTypes,
  "trustly" | "sofort" | "giropay"
>; //trustly was not a part of braintree client and therefore is not a part of current implementation, sofort and giropay are no longer supported by Braintree
