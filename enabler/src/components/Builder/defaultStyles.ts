import {
  ButtonColorOption,
  ButtonLabelOption,
  ButtonShapeOption,
  ButtonSizeOption,
  FlowType,
} from "paypal-checkout-components";

export const ACHDefaultStyleProps = {
  mandateText:
    'By clicking ["Checkout"], I authorize Braintree, a service of PayPal, on behalf of [your business name here] (i) to verify my bank account information using bank information and consumer reports and (ii) to debit my bank account.',
};

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
  commit: true,
  shippingAddressEditable: true,
  // payLater, intent, enableShippingAddress are fixed in RenderTemplate
};

export const PayPalVaultStyleProps = {
  ...PayPalCommonDefaultStyles,
  buttonLabel: "pay" as ButtonLabelOption,
  // flow, payLater, commit, intent are fixed in RenderTemplate
};
