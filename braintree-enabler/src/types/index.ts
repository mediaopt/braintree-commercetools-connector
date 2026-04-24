import { FC } from "react";
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
  braintreeLineItems?: BraintreeLineItem[];
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
  isPureVault?: boolean; //relevant for CreditCard and PayPal only
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
};

type OptionalPerMethodPaymentData = {
  firstName?: string; //ACH
  lastName?: string; //ACH
  streetName?: string; //ACH
  streetNumber?: string; //ACH
  postalCode?: string; //ACH
  email?: string; //credit card with 3Dsecure
  shippingOptions?: (ShippingOption & { countryCode: string })[]; //PayPal express (Buy Now)
  braintreeLineItems?: BraintreeLineItem[]; //PayPal express (Buy Now)
  braintreeShipping?: BraintreeShipping; //PayPal express (Buy Now)
};

export type PaymentInfo = RequiredPaymentData & OptionalPerMethodPaymentData;

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
  paymentType: any;
  countryCode: any;
  currencyCode: any;
  shippingAddressRequired?: boolean;
  fallbackUrl: string;
  fallbackButtonText?: string;
};

interface LocalPaymentBancontact extends LocalPaymentMethodsType {
  paymentType: "bancontact";
  countryCode: "BE";
  currencyCode: "EUR";
}

interface LocalPaymentBLIK extends LocalPaymentMethodsType {
  paymentType: "blik";
  countryCode: "PL";
  currencyCode: "PLN";
}

interface LocalPaymentEPS extends LocalPaymentMethodsType {
  paymentType: "eps";
  countryCode: "AT";
  currencyCode: "EUR";
}

interface LocalPaymentGiropay extends LocalPaymentMethodsType {
  paymentType: "giropay";
  countryCode: "DE";
  currencyCode: "EUR";
}

interface LocalPaymentGrabpay extends LocalPaymentMethodsType {
  paymentType: "grabpay";
  countryCode: "SG";
  currencyCode: "SGD";
}

interface LocalPaymentIdeal extends LocalPaymentMethodsType {
  paymentType: "ideal";
  countryCode: "NL";
  currencyCode: "EUR";
}

interface LocalPaymentSofort extends LocalPaymentMethodsType {
  paymentType: "sofort";
  countryCode: "AT" | "BE" | "DE" | "IT" | "NL" | "ES" | "GB";
  currencyCode: "EUR" | "GBP";
}

interface LocalPaymentMyBank extends LocalPaymentMethodsType {
  paymentType: "mybank";
  countryCode: "IT";
  currencyCode: "EUR";
}

interface LocalPaymentP24 extends LocalPaymentMethodsType {
  paymentType: "p24";
  countryCode: "PL";
  currencyCode: "EUR" | "PL";
}

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

export type LocalPaymentBancontactType = FC<
  GeneralComponentsProps & LocalPaymentBancontact
>;

export type LocalPaymentP24Type = FC<GeneralComponentsProps & LocalPaymentP24>;

export type LocalPaymentSofortType = FC<
  GeneralComponentsProps & LocalPaymentSofort
>;

export type LocalPaymentBLIKType = FC<
  GeneralComponentsProps & LocalPaymentBLIK
>;

export type LocalPaymentEPSType = FC<GeneralComponentsProps & LocalPaymentEPS>;

export type LocalPaymentGiropayType = FC<
  GeneralComponentsProps & LocalPaymentGiropay
>;

export type LocalPaymentGrabpayType = FC<
  GeneralComponentsProps & LocalPaymentGrabpay
>;

export type LocalPaymentIDealType = FC<
  GeneralComponentsProps & LocalPaymentIdeal
>;

export type LocalPaymentMyBankType = FC<
  GeneralComponentsProps & LocalPaymentMyBank
>;
