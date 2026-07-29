import { FC } from "react";

import { PayPalMask } from "./PayPalMask";

import { GeneralPayButtonProps, PayPalProps } from "../../types";

type PayPalButtonProps = PayPalProps & GeneralPayButtonProps;

export const PayPalButton: FC<PayPalButtonProps> = ({
  // PURE_VAULT_DISABLED: isPureVault,
  // PAYPAL_VAULT_DISABLED: enableVaulting, vaultLabel,
  onExpressPayButtonClick,
  onPaymentSubmit,
  fullWidth = true,
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

  return (
    <PayPalMask
      fullWidth={fullWidth}
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
      // PURE_VAULT_DISABLED: isPureVault={isPureVault}
      // PAYPAL_VAULT_DISABLED: enableVaulting={enableVaulting} vaultLabel={vaultLabel}
      onExpressPayButtonClick={onExpressPayButtonClick}
      onPaymentSubmit={onPaymentSubmit}
    />
  );
};
