import { LocalPaymentTypes } from "braintree-web/local-payment";

export type SupportedLocalPaymentTypes = Exclude<LocalPaymentTypes, "trustly">;
