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
