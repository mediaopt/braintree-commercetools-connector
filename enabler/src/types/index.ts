import {
  ButtonColorOption,
  ButtonLabelOption,
  FlowType,
  Intent,
  ButtonShapeOption,
  ButtonSizeOption,
} from "paypal-checkout-components";
import {
  ThreeDSecureAdditionalInformation,
  ThreeDSecureBillingAddress,
} from "braintree-web/three-d-secure";
import { BraintreePaymentMethodType } from "../components/Builder/types";
import { ShippingOption } from "paypal-checkout-components/modules/callback-data";
import { SupportedLocalPaymentTypes } from "../components/LocalPaymentMethods/types";

export type ClientTokenRequest = {
  paymentId: string;
  paymentVersion: number;
  braintreeCustomerId?: string;
  merchantAccountId?: string;
};

export enum LineItemKind {
  Debit = "debit",
  Credit = "credit",
}

export type BraintreeLineItem = {
  name: string;
  kind: LineItemKind;
  quantity: string;
  unitAmount: string;
  unitOfMeasure?: string;
  totalAmount: string;
  taxAmount?: string;
  discountAmount?: string;
  productCode: string;
  commodityCode?: string;
  unitTaxAmount: string;
  description: string;
  url: string;
};

export type UseKount = { useKount?: boolean };

type LineItemsShipping = {
  shipping?: BraintreeShipping;
};

export type GeneralPayButtonProps = {
  fullWidth?: boolean;
  buttonText?: string;
} & UseKount &
  LineItemsShipping;

export type RequestHeader = { [key: string]: string };

type RequiredSessionData = {
  processorUrl: string;
  sessionId: string;
};

export type BuilderType = "dropin" | "express" | undefined;

export type PaymentProviderProps = RequiredSessionData & {
  purchaseCallback: (result: any, options?: any) => void;
  merchantAccountId?: string;
  paymentMethodType: BraintreePaymentMethodType;
  builderType?: BuilderType;
};

export type GeneralComponentsProps = PaymentProviderProps &
  UseKount &
  GeneralPayButtonProps & {
    taxAmount?: string;
    shippingAmount?: string;
    discountAmount?: string;
    shippingMethodId?: string;
  } & LineItemsShipping;

export type LocalPaymentComponentsProp = {
  processorUrl: string;
};

export type ClientTokenResponse = {
  clientToken: string;
  paymentVersion: number;
};

type BraintreePaymentData = {
  clientToken: string;
  braintreeCustomerId: string;
};

type RequiredPaymentData = {
  ctPaymentId: string;
  braintreeAmount: number;
  currency: string;
  ctCustomerId?: string;
  ctCustomerVersion?: number;
};

type OptionalPerMethodPaymentData = {
  firstName?: string; //ACH, local payment methods
  lastName?: string; //ACH, local payment methods
  streetName?: string; //ACH
  streetNumber?: string; //ACH
  postalCode?: string; //ACH
  email?: string; //credit card with 3Dsecure
  shippingOptions?: (ShippingOption & { countryCode: string })[]; //PayPal express (Buy Now)
  braintreeLineItems?: BraintreeLineItem[]; //PayPal express (Buy Now)
  braintreeShipping?: BraintreeShipping; //PayPal express (Buy Now)
  ctCustomerId?: string; //vault
  ctCustomerVersion?: string; //vault
  countryCode?: string; //local payment methods
  fallbackUrl?: string; //local payment methods
};

export type PaymentInfo = RequiredPaymentData & OptionalPerMethodPaymentData;

// Shape must match InitPaymentResponseSchema in processor/src/dtos/braintree-payment.dto.ts
export type CreatePaymentResponse = {
  braintreeData: BraintreePaymentData;
  payment: PaymentInfo;
};

export type TransactionSaleResponse = {
  ok: boolean;
  message: string;
  result: {
    transactionSaleResponse: Record<string, any>;
    paymentVersion: number;
  };
};

export type PayPalFundingSourcesProp = {
  [index: string]: {
    buttonColor?: ButtonColorOption;
    buttonLabel?: ButtonLabelOption;
  };
};

export type PayPalShippingOptions = {
  amount: number;
  countryCode: string;
};

export type PayPalProps = {
  flow: FlowType;
  buttonColor: ButtonColorOption;
  buttonLabel: ButtonLabelOption;
  payLater?: boolean;
  payLaterButtonColor?: ButtonColorOption;
  locale?: string;
  intent?: Intent;
  commit?: boolean;
  enableShippingAddress?: boolean;
  shippingAddressEditable?: boolean;
  billingAgreementDescription?: string;
  shippingAddressOverride?: ShippingAddressOverride;

  shape?: ButtonShapeOption;
  size?: ButtonSizeOption;
  tagline?: boolean;
  height?: number;
  isPureVault?: boolean;
};

export type ShippingAddressOverride = {
  recipientName: string;
  line1: string;
  line2?: string;
  city: string;
  countryCode: string;
  postalCode: string;
  state: string;
  phone?: string;
};

export type GooglePayTypes = {
  environment: google.payments.api.Environment;
  totalPriceStatus: "NOT_CURRENTLY_KNOWN" | "ESTIMATED" | "FINAL";
  googleMerchantId?: string;
  buttonTheme?: google.payments.api.ButtonColor;
  buttonType?: google.payments.api.ButtonType;
  phoneNumberRequired?: boolean;
  billingAddressFormat?: "FULL" | "MIN";
  billingAddressRequired?: boolean;
  acquirerCountryCode: string;
  fullWidth?: boolean; //will be initalized as true if not provided
} & LineItemsShipping;

export type VenmoTypes = {
  mobileWebFallBack: boolean;
  desktopFlow: "desktopWebLogin" | "desktopQRCode";
  paymentMethodUsage: "multi_use" | "single_use";
  allowNewBrowserTab?: boolean;
  profile_id?: string;
  useTestNonce?: boolean;
  setVenmoUserName: (venmoName: string) => any;
  ignoreBowserSupport?: boolean;
};

export type ApplePayTypes = {
  applePayDisplayName: string;
};

export type GenericError = {
  code: string;
  message: string;
};

export type LoadingOverlayType = {
  loadingText?: string;
  textStyles?: string;
};

export type GeneralACHProps = {
  mandateText: string;
  processorUrl: string;
};

export type GeneralCreditCardProps = {
  showPostalCode?: boolean;
  showCardHoldersName?: boolean;
  threeDSBillingAddress?: ThreeDSecureBillingAddress;
  threeDSAdditionalInformation?: ThreeDSecureAdditionalInformation;
  enableVaulting?: boolean;
  continueOnLiabilityShiftPossible?: boolean;
  continueOnNoThreeDS?: boolean;
  isPureVault?: boolean;
};

export type AchVaultRequest = { paymentMethodNonce: string };

export type AchVaultResponse = {
  status: boolean;
  token?: string;
  message?: string;
  verified?: boolean;
};

export type LocalPaymentMethodsType = {
  paymentType: SupportedLocalPaymentTypes;
  shippingAddressRequired?: boolean;
  fallbackButtonText?: string;
  merchantAccountId?: string;
};

export type BraintreeShipping = {
  //todo - check if Braintree shipping must be extended or this one can be reduced
  company?: string;
  countryCodeAlpha2?: string;
  countryCodeAlpha3?: string;
  countryCodeNumeric?: string;
  countryName?: string;
  extendedAddress?: string;
  firstName?: string;
  lastName?: string;
  locality?: string;
  postalCode?: string;
  region?: string;
  streetAddress?: string;
};
