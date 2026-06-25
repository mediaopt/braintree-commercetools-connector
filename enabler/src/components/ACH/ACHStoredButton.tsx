import { FC } from "react";
import { ACHStored, ACHStoredProps } from "./ACHStored";
import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";

export const ACHStoredButton: FC<ACHStoredProps> = ({
  fullWidth = true,
  buttonText,
  useKount,
  shipping,
  onRegisterSubmit,
}: ACHStoredProps) => {
  return (
    <ACHStored
      fullWidth={fullWidth}
      buttonText={buttonText ?? PAY_BUTTON_TEXT_FALLBACK}
      useKount={useKount}
      shipping={shipping}
      onRegisterSubmit={onRegisterSubmit}
    />
  );
};
