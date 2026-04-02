import { FC } from "react";

import { RenderTemplate } from "../RenderTemplate";

import { CreditCardButton } from "./CreditCardButton";

import { GeneralComponentsProps, GeneralCreditCardProps } from "../../types";

type CreditCardProps = GeneralComponentsProps & GeneralCreditCardProps;

export const CreditCard: FC<CreditCardProps> = ({
  processorUrl,
  sessionId,
  purchaseCallback,
  fullWidth,
  buttonText,
  showPostalCode = false,
  showCardHoldersName = false,
  threeDSBillingAddress,
  threeDSAdditionalInformation,
  enableVaulting,
  continueOnLiabilityShiftPossible,
  continueOnNoThreeDS,
  useKount,
  lineItems,
  shipping,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
  isPureVault,
}: CreditCardProps) => {
  return (
    <RenderTemplate
      processorUrl={processorUrl}
      sessionId={sessionId}
      purchaseCallback={purchaseCallback}
      taxAmount={taxAmount}
      shippingAmount={shippingAmount}
      discountAmount={discountAmount}
      shippingMethodId={shippingMethodId}
    >
      <CreditCardButton
        buttonText={buttonText}
        fullWidth={fullWidth}
        showPostalCode={showPostalCode}
        showCardHoldersName={showCardHoldersName}
        threeDSBillingAddress={threeDSBillingAddress}
        threeDSAdditionalInformation={threeDSAdditionalInformation}
        enableVaulting={enableVaulting}
        continueOnLiabilityShiftPossible={continueOnLiabilityShiftPossible}
        continueOnNoThreeDS={continueOnNoThreeDS}
        useKount={useKount}
        lineItems={lineItems}
        shipping={shipping}
        isPureVault={isPureVault}
      />
    </RenderTemplate>
  );
};
