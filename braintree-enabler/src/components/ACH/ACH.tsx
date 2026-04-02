import { FC } from "react";

import { RenderTemplate } from "../RenderTemplate";

import { ACHButton } from "./ACHButton";

import { GeneralComponentsProps, GeneralACHProps } from "../../types";

type ACHProps = GeneralComponentsProps & GeneralACHProps;

export const ACH: FC<ACHProps> = ({
  processorUrl,
  sessionId,
  purchaseCallback,
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
      taxAmount={taxAmount}
      shippingAmount={shippingAmount}
      discountAmount={discountAmount}
      shippingMethodId={shippingMethodId}
    >
      <ACHButton
        processorUrl={processorUrl}
        buttonText={buttonText}
        fullWidth={fullWidth}
        mandateText={mandateText}
        useKount={useKount}
        lineItems={lineItems}
        shipping={shipping}
      />
    </RenderTemplate>
  );
};
