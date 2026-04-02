import { FC } from "react";

import { Intent } from "paypal-checkout-components";

import { RenderTemplate } from "../RenderTemplate";

import { PayPalButton } from "./PayPalButton";

import { GeneralComponentsProps, PayPalProps } from "../../types";

type PayPalComponentProps = PayPalProps & GeneralComponentsProps;

export const PayPal: FC<PayPalComponentProps> = ({
  processorUrl,
  sessionId,
  flow,
  buttonColor,
  buttonLabel,
  purchaseCallback,
  fullWidth,
  buttonText,
  payLater,
  payLaterButtonColor,
  locale = "en_GB",
  intent = "capture" as Intent,
  commit = true,
  enableShippingAddress = true,
  shippingAddressEditable = false,
  billingAgreementDescription = "",
  shippingAddressOverride,
  useKount,
  lineItems,
  shipping,
  shape,
  size,
  tagline,
  height,
  shippingOptions,
  isPureVault,
}: PayPalComponentProps) => {
  return (
    <RenderTemplate
      processorUrl={processorUrl}
      sessionId={sessionId}
      purchaseCallback={purchaseCallback}
    >
      <PayPalButton
        isPureVault={isPureVault}
        buttonText={buttonText}
        fullWidth={fullWidth}
        flow={flow}
        buttonColor={buttonColor}
        buttonLabel={buttonLabel}
        payLater={payLater}
        payLaterButtonColor={payLaterButtonColor}
        locale={locale}
        intent={intent}
        commit={commit}
        enableShippingAddress={enableShippingAddress}
        billingAgreementDescription={billingAgreementDescription}
        shippingAddressEditable={shippingAddressEditable}
        shippingAddressOverride={shippingAddressOverride}
        useKount={useKount}
        lineItems={lineItems}
        shipping={shipping}
        shape={shape}
        size={size}
        tagline={tagline}
        height={height}
        shippingOptions={shippingOptions}
      />
    </RenderTemplate>
  );
};
