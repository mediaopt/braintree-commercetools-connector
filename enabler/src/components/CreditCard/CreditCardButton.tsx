import { FC } from "react";

import { CreditCardMask } from "./CreditCardMask";
import { GeneralCreditCardProps, GeneralPayButtonProps } from "../../types";

type CreditCardButton = GeneralCreditCardProps & GeneralPayButtonProps;

export const CreditCardButton: FC<CreditCardButton> = ({
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
  // PURE_VAULT_DISABLED: isPureVault,
  onRegisterSubmit,
  onRegisterValidation,
}: CreditCardButton) => {

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
      // PURE_VAULT_DISABLED: isPureVault={isPureVault}
      onRegisterSubmit={onRegisterSubmit}
      onRegisterValidation={onRegisterValidation}
    />
  );
};
