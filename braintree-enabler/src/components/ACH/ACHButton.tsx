import React from "react";

import { usePayment } from "../../app/usePayment";
import { PayButtonProps, PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";
import { useHandleGetClientToken } from "../../app/useHandleGetClientToken";

import { CartInformationProps, GeneralACHProps } from "../../types";

import { ACHMask } from "./ACHMask";

type ACHButtonProps = PayButtonProps & CartInformationProps & GeneralACHProps;

export const ACHButton: React.FC<ACHButtonProps> = ({
  disabled,
  fullWidth = true,
  buttonText,
  cartInformation,
  mandateText,
  getAchVaultTokenURL,
  useKount,
  lineItems,
  shipping,
  shippingMethodId,
}: ACHButtonProps) => {
  const { clientToken } = usePayment();

  useHandleGetClientToken(disabled, undefined, shippingMethodId);

  return clientToken ? (
    <ACHMask
      fullWidth={fullWidth}
      buttonText={buttonText ?? PAY_BUTTON_TEXT_FALLBACK}
      cartInformation={cartInformation}
      mandateText={mandateText}
      getAchVaultTokenURL={getAchVaultTokenURL}
      useKount={useKount}
      lineItems={lineItems}
      shipping={shipping}
    />
  ) : (
    <></>
  );
};
