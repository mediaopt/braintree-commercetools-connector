import { FC } from "react";

import { PayPalStored, PayPalStoredProps } from "./PayPalStored";
import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";

export const PayPalStoredButton: FC<PayPalStoredProps> = ({
  fullWidth = true,
  buttonText,
  useKount,
  shipping,
  onRegisterSubmit,
}: PayPalStoredProps) => {
  return (
    <PayPalStored
      fullWidth={fullWidth}
      buttonText={buttonText ?? PAY_BUTTON_TEXT_FALLBACK}
      useKount={useKount}
      shipping={shipping}
      onRegisterSubmit={onRegisterSubmit}
    />
  );
};
