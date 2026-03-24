import React from "react";

import { RenderTemplate } from "../RenderTemplate";
import { isPayButtonDisabled } from "../PayButton";

import { CreditCardButton } from "./CreditCardButton";

import { GeneralComponentsProps, GeneralCreditCardProps } from "../../types";

type CreditCardProps = GeneralComponentsProps & GeneralCreditCardProps;

export const CreditCard: React.FC<CreditCardProps> = ({
  createPaymentUrl,
  getClientTokenUrl,
  purchaseUrl,
  purchaseCallback,
  cartInformation,
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
  createPaymentForVault,
  vaultPaymentMethodUrl,
  requestHeader,
}: CreditCardProps) => {
  return (
    <RenderTemplate
      requestHeader={requestHeader}
      getClientTokenUrl={getClientTokenUrl}
      createPaymentUrl={createPaymentUrl}
      purchaseUrl={purchaseUrl}
      purchaseCallback={purchaseCallback}
      cartInformation={cartInformation}
      taxAmount={taxAmount}
      shippingAmount={shippingAmount}
      discountAmount={discountAmount}
      shippingMethodId={shippingMethodId}
      createPaymentForVault={createPaymentForVault}
      vaultPaymentMethodUrl={vaultPaymentMethodUrl}
    >
      <CreditCardButton
        disabled={isPayButtonDisabled(cartInformation) && !isPureVault}
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
        shippingMethodId={shippingMethodId}
        isPureVault={isPureVault}
      />
    </RenderTemplate>
  );
};
