import { FC } from "react";

import { CreditCardStored, CreditCardStoredProps } from "./CreditCardStored";

export const CreditCardStoredButton: FC<CreditCardStoredProps> = ({
  onRegisterSubmit,
  id,
}: CreditCardStoredProps) => {
  return <CreditCardStored onRegisterSubmit={onRegisterSubmit} id={id} />;
};
