import { SupportedLocalPaymentTypes } from "./types";
import { LOCAL_PAYMENT_COUNTRIES_AND_CURRENCIES } from "./constants";

export const validateCountryAndCurrency = (
  localPaymentMethodType: SupportedLocalPaymentTypes,
  countryCode: string,
  currencyCode: string,
): { isCountryValid: boolean; isCurrencyValid: boolean } => {
  const { countries, currencies } =
    LOCAL_PAYMENT_COUNTRIES_AND_CURRENCIES[localPaymentMethodType];
  return {
    isCountryValid: countries.includes(countryCode),
    isCurrencyValid: currencies.includes(currencyCode),
  };
};
