import { FC } from "react";

import { CreditCardStored, CreditCardStoredProps } from "./CreditCardStored";

export const CreditCardStoredButton: FC<CreditCardStoredProps> = ({
  onRegisterSubmit,
}: CreditCardStoredProps) => {
  return <CreditCardStored onRegisterSubmit={onRegisterSubmit} />;
};
