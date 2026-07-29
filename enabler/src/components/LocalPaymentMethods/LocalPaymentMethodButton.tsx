import { FC } from "react";

import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";
import { GeneralPayButtonProps, LocalPaymentMethodsType } from "../../types";
import { LocalPaymentMethodMask } from "./LocalPaymentMethodMask";

type LocalPaymentMethod = LocalPaymentMethodsType & GeneralPayButtonProps;

export const LocalPaymentMethodButton: FC<LocalPaymentMethod> = ({
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
