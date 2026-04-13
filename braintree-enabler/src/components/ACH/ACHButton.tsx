import { FC } from "react";

import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";

import { GeneralACHProps, GeneralPayButtonProps } from "../../types";

import { ACHMask } from "./ACHMask";

type ACHButtonProps = GeneralPayButtonProps & GeneralACHProps;

export const ACHButton: FC<ACHButtonProps> = ({
  processorUrl,
  fullWidth = true,
  buttonText,
  mandateText,
  useKount,
  lineItems,
  shipping,
}: ACHButtonProps) => {
  return (
    <ACHMask
      fullWidth={fullWidth}
      buttonText={buttonText ?? PAY_BUTTON_TEXT_FALLBACK}
      mandateText={mandateText}
      processorUrl={processorUrl}
      useKount={useKount}
      lineItems={lineItems}
      shipping={shipping}
    />
  );
};
