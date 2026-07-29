import { FC } from "react";

import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";

import { GeneralACHProps, GeneralPayButtonProps } from "../../types";

import { ACHMask } from "./ACHMask";

// Fallback for the button-click label quoted inside the ACH mandate text (e.g. `By clicking
// ["COMPLETE CHECKOUT"], ...`) when the merchant hasn't set ach.actionLabel. If a merchant
// customizes the actual button label in the merchant center, it's their responsibility to set
// ach.actionLabel to match — this connector has no way to read that label back.
export const ACH_ACTION_LABEL_FALLBACK = "COMPLETE CHECKOUT";

type ACHButtonProps = GeneralPayButtonProps & GeneralACHProps;

export const ACHButton: FC<ACHButtonProps> = ({
  processorUrl,
  fullWidth = true,
  buttonText,
  mandateText,
  merchantBusinessName,
  actionLabel,
  useKount,
  shipping,
  onRegisterSubmit,
  onRegisterValidation,
  onError,
}: ACHButtonProps) => {
  return (
    <ACHMask
      fullWidth={fullWidth}
      buttonText={buttonText ?? PAY_BUTTON_TEXT_FALLBACK}
      mandateText={mandateText}
      merchantBusinessName={merchantBusinessName}
      actionLabel={actionLabel ?? ACH_ACTION_LABEL_FALLBACK}
      processorUrl={processorUrl}
      useKount={useKount}
      shipping={shipping}
      onRegisterSubmit={onRegisterSubmit}
      onRegisterValidation={onRegisterValidation}
      onError={onError}
    />
  );
};
