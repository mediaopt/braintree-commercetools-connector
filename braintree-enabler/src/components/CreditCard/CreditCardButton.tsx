import React from "react";

import { usePayment } from "../../app/usePayment";
import { CreditCardMask } from "./CreditCardMask";
import {
  PAY_BUTTON_TEXT_FALLBACK,
  VAULT_BUTTON_TEXT_FALLBACK,
  PayButtonProps,
} from "../PayButton";
import { GeneralCreditCardProps } from "../../types";
import { useHandleGetClientToken } from "../../app/useHandleGetClientToken";

type CreditCardButton = GeneralCreditCardProps & PayButtonProps;

export const CreditCardButton: React.FC<CreditCardButton> = ({
  disabled,
  fullWidth = true,
  buttonText,
  showPostalCode,
  showCardHoldersName,
  threeDSAdditionalInformation,
  threeDSBillingAddress,
  enableVaulting,
  continueOnLiabilityShiftPossible,
  continueOnNoThreeDS,
  useKount,
  lineItems,
  shipping,
  shippingMethodId,
  isPureVault,
}: CreditCardButton) => {
  const { clientToken } = usePayment();

  useHandleGetClientToken(disabled, undefined, shippingMethodId, isPureVault);

  const FALLBACK_TEXT = isPureVault
    ? VAULT_BUTTON_TEXT_FALLBACK
    : PAY_BUTTON_TEXT_FALLBACK;

  return clientToken ? (
    <CreditCardMask
      fullWidth={fullWidth}
      buttonText={buttonText ?? FALLBACK_TEXT}
      showPostalCode={showPostalCode}
      showCardHoldersName={showCardHoldersName}
      threeDSAdditionalInformation={threeDSAdditionalInformation}
      threeDSBillingAddress={threeDSBillingAddress}
      enableVaulting={enableVaulting}
      continueOnLiabilityShiftPossible={continueOnLiabilityShiftPossible}
      continueOnNoThreeDS={continueOnNoThreeDS}
      useKount={useKount}
      lineItems={lineItems}
      shipping={shipping}
      isPureVault={isPureVault}
    />
  ) : (
    <></>
  );
};
