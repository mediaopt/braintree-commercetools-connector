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
  giropay: { countries: ["DE"], currencies: ["EUR"] },
  //  grabpay: { countries: ['SG'], currencies: ['SGD'] }, todo clarify with PayPal if this should be supported
  ideal: { countries: ["NL"], currencies: ["EUR"] },
  mybank: { countries: ["IT"], currencies: ["EUR"] },
  p24: { countries: ["PL"], currencies: ["EUR", "PLN"] },
  sofort: {
    countries: ["AT", "BE", "DE", "IT", "NL", "ES", "GB"],
    currencies: ["EUR", "GBP"],
  },
  bancontact: { countries: ["BE"], currencies: ["EUR"] },
};

export const SUPPORTED_LOCAL_PAYMENT_TYPES = Object.keys(
  LOCAL_PAYMENT_COUNTRIES_AND_CURRENCIES,
) as SupportedLocalPaymentTypes[];
