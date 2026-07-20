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
import { CTAmount } from "../payment-enabler/interfaces/general";
import { ExpressAddressData } from "../payment-enabler/interfaces/express";

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
  onRegisterSubmit?: (handler: (storePaymentDetails?: boolean) => Promise<void>) => void;
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
  // PayPal Express deferred-cart-creation mode — see enabler/src/app/usePayment.tsx
  deferredPaymentCreation?: boolean;
  initialAmount?: CTAmount;
};

export type GeneralComponentsProps = PaymentProviderProps &
  UseKount &
  GeneralPayButtonProps & {
    taxAmount?: string;
    shippingAmount?: string;
    discountAmount?: string;
    shippingMethodId?: string;
  } & LineItemsShipping;

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

type PayPalButtonStyleOverride = {
  buttonColor?: ButtonColorOption;
  buttonLabel?: ButtonLabelOption;
  payLaterButtonColor?: ButtonColorOption;
  locale?: string;
  shape?: ButtonShapeOption;
  size?: ButtonSizeOption;
  tagline?: boolean;
  height?: number;
};

// Shape must match BRAINTREE_BUTTON_STYLES env var in processor/src/config/config.ts
export type ButtonStyleOverrides = {
  paypal?:        PayPalButtonStyleOverride & { payLater?: boolean; billingAgreementDescription?: string };
  paypalExpress?: PayPalButtonStyleOverride;
  paypalVault?:   PayPalButtonStyleOverride;
  ach?:           { mandateText?: string; pendingVerificationText?: string };
  applePay?:      { applePayDisplayName?: string };
  googlePay?: {
    buttonTheme?: google.payments.api.ButtonColor;
    buttonType?: google.payments.api.ButtonType;
    totalPriceStatus?: "NOT_CURRENTLY_KNOWN" | "ESTIMATED" | "FINAL";
    billingAddressRequired?: boolean;
    billingAddressFormat?: "FULL" | "MIN";
    phoneNumberRequired?: boolean;
  };
  venmo?: {
    desktopFlow?: "desktopWebLogin" | "desktopQRCode";
    mobileWebFallBack?: boolean;
    paymentMethodUsage?: "multi_use" | "single_use";
    allowNewBrowserTab?: boolean;
  };
  creditCard?: {
    showPostalCode?: boolean;
    showCardHoldersName?: boolean;
    continueOnLiabilityShiftPossible?: boolean;
    continueOnNoThreeDS?: boolean;
  };
};

// Shape must match BRAINTREE_PER_METHOD_CONFIG env var in processor/src/config/config.ts
export type PerMethodConfig = {
  googlePay?: {
    googleMerchantId?: string;
    acquirerCountryCode?: string;
  };
  venmo?: {
    profileId?: string;
  };
  creditCard?: {
    vaultLabel?: string;
  };
  paypal?: {
    vaultLabel?: string;
  };
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

// Shape must match ExpressClientTokenResponseSchema in processor/src/dtos/braintree-payment.dto.ts
export type ExpressClientTokenResponse = {
  braintreeData: BraintreePaymentData;
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
  // PURE_VAULT_DISABLED: isPureVault?: boolean;
  // Accepted and passed through for compatibility, but currently inert — see
  // PAYPAL_VAULT_DISABLED in PayPalMask.tsx's showVaultCheckbox; please open an issue if you are
  // interested in this.
  enableVaulting?: boolean;
  vaultLabel?: string;
  // PayPal Express deferred-cart-creation mode — see enabler/src/app/usePayment.tsx
  onExpressPayButtonClick?: () => Promise<void>;
  // PayPal Express final address/email sync — see ExpressOptions.onPaymentSubmit
  onPaymentSubmit?: (opts: {
    shippingAddress: ExpressAddressData;
    billingAddress: ExpressAddressData;
    customerEmail: string;
  }) => Promise<void>;
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
  acquirerCountryCode?: string;
  fullWidth?: boolean; //will be initalized as true if not provided
} & LineItemsShipping;

export type VenmoTypes = {
  mobileWebFallBack: boolean;
  desktopFlow: "desktopWebLogin" | "desktopQRCode";
  paymentMethodUsage: "multi_use" | "single_use";
  allowNewBrowserTab?: boolean;
  profile_id?: string;
  useTestNonce?: boolean;
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
  pendingVerificationText?: string;
};

export type GeneralCreditCardProps = {
  showPostalCode?: boolean;
  showCardHoldersName?: boolean;
  threeDSBillingAddress?: ThreeDSecureBillingAddress;
  threeDSAdditionalInformation?: ThreeDSecureAdditionalInformation;
  enableVaulting?: boolean;
  vaultLabel?: string;
  continueOnLiabilityShiftPossible?: boolean;
  continueOnNoThreeDS?: boolean;
  // PURE_VAULT_DISABLED: isPureVault?: boolean;
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
