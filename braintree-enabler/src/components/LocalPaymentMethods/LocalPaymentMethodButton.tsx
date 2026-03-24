import React from "react";

import { usePayment } from "../../app/usePayment";
import { PAY_BUTTON_TEXT_FALLBACK, PayButtonProps } from "../PayButton";
import {
  LocalPaymentComponentsProp,
  LocalPaymentMethodsType,
} from "../../types";
import { useHandleGetClientToken } from "../../app/useHandleGetClientToken";
import { LocalPaymentMethodMask } from "./LocalPaymentMethodMask";

type LocalPaymentMethod = LocalPaymentComponentsProp &
  LocalPaymentMethodsType &
  PayButtonProps;

export const LocalPaymentMethodButton: React.FC<LocalPaymentMethod> = ({
  saveLocalPaymentIdUrl,
  disabled,
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
  shipping,
  shippingMethodId,
}: LocalPaymentMethod) => {
  const { clientToken } = usePayment();

  useHandleGetClientToken(disabled, merchantAccountId, shippingMethodId);

  return clientToken ? (
    <LocalPaymentMethodMask
      saveLocalPaymentIdUrl={saveLocalPaymentIdUrl}
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
