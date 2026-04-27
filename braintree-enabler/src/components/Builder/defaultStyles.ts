import {
  ButtonColorOption,
  ButtonLabelOption,
  ButtonShapeOption,
  ButtonSizeOption,
} from "paypal-checkout-components";

export const ACHDefaultStyleProps = {
  mandateText:
    'By clicking ["Checkout"], I authorize Braintree, a service of PayPal, on behalf of [your business name here] (i) to verify my bank account information using bank information and consumer reports and (ii) to debit my bank account.',
};

export const ApplePayDefaultStyleProps = {
  applePayDisplayName: "My Store",
};

export const PayPalDefaultStyleProps = {
  // flow: "checkout", //todo - move commented out to config or to base options
  // intent: "capture",
  //useKount: true,
  buttonColor: "blue" as ButtonColorOption,
  buttonLabel: "pay" as ButtonLabelOption,
  payLater: true,
  payLaterButtonColor: "blue" as ButtonColorOption,
  locale: "en_GB",
  shape: "pill" as ButtonShapeOption,
  size: "small" as ButtonSizeOption,
  tagline: true,
  height: 55,
};

export const PayPalExpressStyleProps = {
  flow: "checkout", //required
  buttonColor: "gold",
  buttonLabel: "buynow",
  payLater: false,
  commit: true,
  locale: "en_GB",
  intent: "capture",
  enableShippingAddress: true,
  shippingAddressEditable: true,
};

export const PayPalVaultStyleProps = {
  flow: "vault", //required for pure vault
  buttonColor: "blue" as ButtonColorOption,
  buttonLabel: "pay" as ButtonLabelOption,
  payLater: false,
  commit: false,
  locale: "en_GB",
  intent: "tokenize",
};
