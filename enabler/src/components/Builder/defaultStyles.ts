import {
  ButtonColorOption,
  ButtonLabelOption,
  ButtonShapeOption,
  ButtonSizeOption,
  FlowType,
} from "paypal-checkout-components";

export const ApplePayDefaultStyleProps = {
  applePayDisplayName: "My Store",
};

const PayPalCommonDefaultStyles = {
  buttonColor: "gold" as ButtonColorOption,
  shape: "pill" as ButtonShapeOption,
  size: "small" as ButtonSizeOption,
  payLaterButtonColor: "gold" as ButtonColorOption,
  locale: "en_GB",
};

export const PayPalDefaultStyleProps = {
  ...PayPalCommonDefaultStyles,
  buttonLabel: "pay" as ButtonLabelOption,
  payLater: true,
  tagline: true,
  height: 55,
};

export const PayPalExpressStyleProps = {
  ...PayPalCommonDefaultStyles,
  flow: "checkout" as FlowType,
  buttonLabel: "buynow" as ButtonLabelOption,
  shippingAddressEditable: true,
  // payLater, intent, enableShippingAddress, commit are fixed in RenderTemplate
};

/* PURE_VAULT_DISABLED start — pure vault cancelled; uncomment to re-enable
export const PayPalVaultStyleProps = {
  ...PayPalCommonDefaultStyles,
  buttonLabel: "pay" as ButtonLabelOption,
  // flow, payLater, commit, intent are fixed in RenderTemplate
};
PURE_VAULT_DISABLED end */
