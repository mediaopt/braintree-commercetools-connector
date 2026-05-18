import {
  ButtonColorOption,
  ButtonLabelOption,
  ButtonShapeOption,
  ButtonSizeOption,
  FlowType,
  Intent,
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
  // flow: "checkout", //todo - move commented out to config or to base options
  // intent: "capture",
  //useKount: true,
  ...PayPalCommonDefaultStyles,
  buttonLabel: "pay" as ButtonLabelOption,
  payLater: true,
  tagline: true,
  height: 55,
};

export const PayPalExpressStyleProps = {
  ...PayPalCommonDefaultStyles,
  flow: "checkout" as FlowType, //required
  buttonLabel: "buynow" as ButtonLabelOption,
  payLater: false,
  commit: true,
  intent: "capture" as Intent,
  enableShippingAddress: true,
  shippingAddressEditable: true,
};

export const PayPalVaultStyleProps = {
  ...PayPalCommonDefaultStyles,
  flow: "vault", //required for pure vault
  buttonColor: "gold" as ButtonColorOption,
  buttonLabel: "pay" as ButtonLabelOption,
  payLater: false,
  commit: false,
  intent: "tokenize" as Intent,
};
