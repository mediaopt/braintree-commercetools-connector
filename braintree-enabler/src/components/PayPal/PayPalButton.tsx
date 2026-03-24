import React from "react";

import { usePayment } from "../../app/usePayment";
import {
  PayButtonProps,
  PAY_BUTTON_TEXT_FALLBACK,
  VAULT_BUTTON_TEXT_FALLBACK,
} from "../PayButton";
import { useHandleGetClientToken } from "../../app/useHandleGetClientToken";

import { PayPalMask } from "./PayPalMask";

import { PayPalProps } from "../../types";

type PayPalButtonProps = PayPalProps & PayButtonProps;

export const PayPalButton: React.FC<PayPalButtonProps> = ({
  disabled,
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
  lineItems,
  shipping,
  shape,
  size,
  tagline,
  height,
  shippingOptions,
  shippingMethodId,
  isPureVault,
}) => {
  const { clientToken } = usePayment();

  useHandleGetClientToken(disabled, undefined, shippingMethodId, isPureVault);

  const FALLBACK_TEXT = isPureVault
    ? VAULT_BUTTON_TEXT_FALLBACK
    : PAY_BUTTON_TEXT_FALLBACK;

  return clientToken ? (
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
      lineItems={lineItems}
      shipping={shipping}
      shape={shape}
      size={size}
      tagline={tagline}
      height={height}
      shippingOptions={shippingOptions}
      isPureVault={isPureVault}
    />
  ) : (
    <></>
  );
};
