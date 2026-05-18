import { FC } from "react";

import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";
import {
  GeneralPayButtonProps,
  LocalPaymentComponentsProp,
  LocalPaymentMethodsType,
} from "../../types";
import { LocalPaymentMethodMask } from "./LocalPaymentMethodMask";

type LocalPaymentMethod = LocalPaymentComponentsProp &
  LocalPaymentMethodsType &
  GeneralPayButtonProps;

export const LocalPaymentMethodButton: FC<LocalPaymentMethod> = ({
  processorUrl,
  fullWidth = true,
  buttonText = PAY_BUTTON_TEXT_FALLBACK,
  paymentType,
  currencyCode,
  countryCode,
  fallbackUrl,
  fallbackButtonText = PAY_BUTTON_TEXT_FALLBACK,
  shippingAddressRequired,
  useKount,
  braintreeLineItems,
  shipping,
}: LocalPaymentMethod) => {
  return (
    <LocalPaymentMethodMask
      processorUrl={processorUrl}
      paymentType={paymentType}
      countryCode={countryCode}
      currencyCode={currencyCode}
      fullWidth={fullWidth}
      buttonText={buttonText}
      fallbackUrl={fallbackUrl}
      fallbackButtonText={fallbackButtonText}
      shippingAddressRequired={shippingAddressRequired}
      useKount={useKount}
      braintreeLineItems={braintreeLineItems}
      shipping={shipping}
    />
  );
};
