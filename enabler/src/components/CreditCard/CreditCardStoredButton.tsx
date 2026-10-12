import { FC } from "react";

import { CreditCardStored, CreditCardStoredProps } from "./CreditCardStored";

export const CreditCardStoredButton: FC<CreditCardStoredProps> = ({
  onRegisterSubmit,
  onError,
  id,
}: CreditCardStoredProps) => {
  return (
    <CreditCardStored
      onRegisterSubmit={onRegisterSubmit}
      onError={onError}
      id={id}
    />
  );
};
