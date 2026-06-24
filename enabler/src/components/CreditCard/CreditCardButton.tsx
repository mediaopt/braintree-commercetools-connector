import { FC } from "react";

import { CreditCardMask } from "./CreditCardMask";
import {
  PAY_BUTTON_TEXT_FALLBACK,
  VAULT_BUTTON_TEXT_FALLBACK,
} from "../PayButton";
import { GeneralCreditCardProps, GeneralPayButtonProps } from "../../types";

type CreditCardButton = GeneralCreditCardProps & GeneralPayButtonProps;

export const CreditCardButton: FC<CreditCardButton> = ({
  fullWidth = true,
  buttonText,
  showPostalCode,
  showCardHoldersName,
  threeDSAdditionalInformation,
  threeDSBillingAddress,
  enableVaulting,
  vaultLabel,
  continueOnLiabilityShiftPossible,
  continueOnNoThreeDS,
  useKount,
  shipping,
  isPureVault,
  onRegisterSubmit,
}: CreditCardButton) => {
  const FALLBACK_TEXT = isPureVault
    ? VAULT_BUTTON_TEXT_FALLBACK
    : PAY_BUTTON_TEXT_FALLBACK;

  return (
    <CreditCardMask
      showPostalCode={showPostalCode}
      showCardHoldersName={showCardHoldersName}
      threeDSAdditionalInformation={threeDSAdditionalInformation}
      threeDSBillingAddress={threeDSBillingAddress}
      enableVaulting={enableVaulting}
      vaultLabel={vaultLabel}
      continueOnLiabilityShiftPossible={continueOnLiabilityShiftPossible}
      continueOnNoThreeDS={continueOnNoThreeDS}
      useKount={useKount}
      shipping={shipping}
      isPureVault={isPureVault}
      onRegisterSubmit={onRegisterSubmit}
    />
  );
};
