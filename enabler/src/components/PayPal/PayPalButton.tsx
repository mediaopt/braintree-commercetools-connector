import { FC } from "react";

import {
  PAY_BUTTON_TEXT_FALLBACK,
  VAULT_BUTTON_TEXT_FALLBACK,
} from "../PayButton";

import { PayPalMask } from "./PayPalMask";

import { GeneralPayButtonProps, PayPalProps } from "../../types";

type PayPalButtonProps = PayPalProps & GeneralPayButtonProps;

export const PayPalButton: FC<PayPalButtonProps> = ({
  isPureVault,
  fullWidth = true,
  buttonText,
  flow,
  buttonLabel,
  buttonColor,
  payLater,
  payLaterButtonColor,
  locale,
  intent,
  commit,
  enableShippingAddress,
  billingAgreementDescription,
  shippingAddressEditable,
  shippingAddressOverride,
  useKount,
  shipping,
  shape,
  size,
  tagline,
  height,
}) => {
  const FALLBACK_TEXT = isPureVault
    ? VAULT_BUTTON_TEXT_FALLBACK
    : PAY_BUTTON_TEXT_FALLBACK;

  return (
    <PayPalMask
      fullWidth={fullWidth}
      buttonText={buttonText ?? FALLBACK_TEXT}
      flow={flow}
      buttonLabel={buttonLabel}
      buttonColor={buttonColor}
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
      shipping={shipping}
      shape={shape}
      size={size}
      tagline={tagline}
      height={height}
      isPureVault={isPureVault}
    />
  );
};
