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
  fallbackButtonText = PAY_BUTTON_TEXT_FALLBACK,
  shippingAddressRequired,
  useKount,
  shipping,
}: LocalPaymentMethod) => {
  return (
    <LocalPaymentMethodMask
      processorUrl={processorUrl}
      paymentType={paymentType}
      fullWidth={fullWidth}
      buttonText={buttonText}
      fallbackButtonText={fallbackButtonText}
      shippingAddressRequired={shippingAddressRequired}
      useKount={useKount}
      shipping={shipping}
    />
  );
};
