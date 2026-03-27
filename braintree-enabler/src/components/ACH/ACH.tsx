import { FC } from "react";

import { RenderTemplate } from "../RenderTemplate";
import { isPayButtonDisabled } from "../PayButton";

import { ACHButton } from "./ACHButton";

import { GeneralComponentsProps, GeneralACHProps } from "../../types";

type ACHProps = GeneralComponentsProps & GeneralACHProps;

export const ACH: FC<ACHProps> = ({
  processorUrl,
  sessionId,
  purchaseCallback,
  cartInformation,
  fullWidth,
  buttonText,
  mandateText,
  useKount,
  lineItems,
  shipping,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
}: ACHProps) => {
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
      <ACHButton
        processorUrl={processorUrl}
        disabled={isPayButtonDisabled(cartInformation)}
        buttonText={buttonText}
        fullWidth={fullWidth}
        cartInformation={cartInformation}
        mandateText={mandateText}
        useKount={useKount}
        lineItems={lineItems}
        shipping={shipping}
        shippingMethodId={shippingMethodId}
      />
    </RenderTemplate>
  );
};
