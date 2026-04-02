import { FC } from "react";

import { usePayment } from "../../app/usePayment";
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
  merchantAccountId,
  fallbackUrl,
  fallbackButtonText = PAY_BUTTON_TEXT_FALLBACK,
  shippingAddressRequired,
  useKount,
  lineItems,
  shipping
}: LocalPaymentMethod) => {
  const { clientToken, handleInitPayment } = usePayment();
  handleInitPayment();

  return clientToken ? (
    <LocalPaymentMethodMask
      processorUrl={processorUrl}
      paymentType={paymentType}
      countryCode={countryCode}
      currencyCode={currencyCode}
      fullWidth={fullWidth}
      buttonText={buttonText}
      merchantAccountId={merchantAccountId}
      fallbackUrl={fallbackUrl}
      fallbackButtonText={fallbackButtonText}
      shippingAddressRequired={shippingAddressRequired}
      useKount={useKount}
      lineItems={lineItems}
      shipping={shipping}
    />
  ) : (
    <></>
  );
};
