import { FC } from "react";

import { RenderTemplate } from "../RenderTemplate";
import { isPayButtonDisabled } from "../PayButton";

import { ApplePayButton } from "./ApplePayButton";

import { GeneralComponentsProps, ApplePayTypes } from "../../types";

type ApplePayComponentProps = ApplePayTypes & GeneralComponentsProps;

export const ApplePay: FC<ApplePayComponentProps> = ({
  processorUrl,
  sessionId,
  purchaseCallback,
  cartInformation,
  fullWidth,
  buttonText,
  applePayDisplayName,
  lineItems,
  shipping,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
}: ApplePayComponentProps) => {
  return (
    <RenderTemplate
      processorUrl={processorUrl}
      sessionId={sessionId}
      purchaseCallback={purchaseCallback}
      cartInformation={cartInformation}
      taxAmount={taxAmount}
      shippingAmount={shippingAmount}
      discountAmount={discountAmount}
      shippingMethodId={shippingMethodId}
    >
      <ApplePayButton
        disabled={isPayButtonDisabled(cartInformation)}
        buttonText={buttonText}
        fullWidth={fullWidth}
        applePayDisplayName={applePayDisplayName}
        lineItems={lineItems}
        shipping={shipping}
        shippingMethodId={shippingMethodId}
      />
    </RenderTemplate>
  );
};
