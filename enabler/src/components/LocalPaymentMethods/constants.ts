import { SupportedLocalPaymentTypes } from "./types";

export const LOCAL_PAYMENT_COUNTRIES_AND_CURRENCIES: Record<
  SupportedLocalPaymentTypes,
  {
    countries: string[];
    currencies: string[];
  }
> = {
  blik: { countries: ["PL"], currencies: ["PLN"] },
  eps: { countries: ["AT"], currencies: ["EUR"] },
  //  grabpay: { countries: ['SG'], currencies: ['SGD'] }, — omitted for now; please open an issue if you are interested in this payment method.
  ideal: { countries: ["NL"], currencies: ["EUR"] },
  mybank: { countries: ["IT"], currencies: ["EUR"] }, // no commercetools icon-key equivalent — see Builder/paymentMethodTypeMapping.ts
  p24: { countries: ["PL"], currencies: ["EUR", "PLN"] },
  bancontact: { countries: ["BE"], currencies: ["EUR"] },
};

export const SUPPORTED_LOCAL_PAYMENT_TYPES = Object.keys(
  LOCAL_PAYMENT_COUNTRIES_AND_CURRENCIES,
) as SupportedLocalPaymentTypes[];
