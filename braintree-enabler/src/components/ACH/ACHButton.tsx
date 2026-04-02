import { FC } from "react";

import { usePayment } from "../../app/usePayment";
import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";

import {
  CartInformationProps,
  GeneralACHProps,
  GeneralPayButtonProps,
} from "../../types";

import { ACHMask } from "./ACHMask";

type ACHButtonProps = GeneralPayButtonProps &
  CartInformationProps &
  GeneralACHProps;

export const ACHButton: FC<ACHButtonProps> = ({
  processorUrl,
  fullWidth = true,
  buttonText,
  cartInformation,
  mandateText,
  useKount,
  lineItems,
  shipping,
}: ACHButtonProps) => {
  const { clientToken, handleInitPayment } = usePayment();
  handleInitPayment();

  return clientToken ? (
    <ACHMask
      fullWidth={fullWidth}
      buttonText={buttonText ?? PAY_BUTTON_TEXT_FALLBACK}
      cartInformation={cartInformation}
      mandateText={mandateText}
      processorUrl={processorUrl}
      useKount={useKount}
      lineItems={lineItems}
      shipping={shipping}
    />
  ) : (
    <></>
  );
};
