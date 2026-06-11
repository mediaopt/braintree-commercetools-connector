import { FC, PropsWithChildren } from "react";

import { NotificationsProvider } from "../../app/useNotifications";
import { PaymentProvider } from "../../app/usePayment";
import { LoaderProvider } from "../../app/useLoader";
import { RenderPurchase } from "../RenderPurchase";

import { BraintreePaymentMethodType } from "../Builder/types";
import { BaseOptions } from "../../payment-enabler/interfaces/baseOptions";
import { ComponentOptions } from "../../payment-enabler/interfaces/enabler";
import {
  ACHDefaultStyleProps,
  ApplePayDefaultStyleProps,
  PayPalDefaultStyleProps,
  PayPalExpressStyleProps,
  PayPalVaultStyleProps,
} from "../Builder/defaultStyles";
import { FlowType, Intent } from "paypal-checkout-components";
import { ACHButton } from "../ACH/ACHButton";
import { ApplePayButton } from "../ApplePay/ApplePayButton";
import { CreditCardButton } from "../CreditCard/CreditCardButton";
import { GooglePayButton } from "../GooglePay/GooglePayButton";
import { PayPalButton } from "../PayPal/PayPalButton";
import { VenmoButton } from "../Venmo/VenmoButton";
import { LocalPaymentMethodButton } from "../LocalPaymentMethods/LocalPaymentMethodButton";
import { BuilderType } from "../../types";
import { SupportedLocalPaymentTypes } from "../LocalPaymentMethods/types";
import { SUPPORTED_LOCAL_PAYMENT_TYPES } from "../LocalPaymentMethods/constants";

type BraintreeBuilderTemplateProps = {
  paymentMethodType: BraintreePaymentMethodType;
  customOptions: BaseOptions & ComponentOptions;
  builderType: BuilderType;
};

const ComponentWithCustomOptions = ({
  paymentMethodType,
  customOptions,
  builderType,
}: BraintreeBuilderTemplateProps) => {
  // buttonStyleOverrides: from BRAINTREE_BUTTON_STYLES env var via processor /operations/config
  // braintreeEnvironment: "Sandbox" | "Production" from processor config
  const { buttonStyleOverrides, braintreeEnvironment, ...restCustomOptions } = customOptions;

  switch (paymentMethodType) {
    // --- Standard component/dropin methods ---
    case "ACH":
      return <ACHButton {...ACHDefaultStyleProps} {...buttonStyleOverrides?.ach} {...restCustomOptions} />;
    case "ApplePay":
      return (
        <ApplePayButton {...ApplePayDefaultStyleProps} {...buttonStyleOverrides?.applePay} {...restCustomOptions} />
      );
    case "GooglePay":
      return (
        <GooglePayButton
          totalPriceStatus={"FINAL"} //todo - move params to options and config and add to options a possobility to set styles params
          googleMerchantId={"merchant-id-from-google"}
          acquirerCountryCode={"DE"}
          environment={braintreeEnvironment === "Production" ? "PRODUCTION" : "TEST"}
          {...restCustomOptions}
        />
      );
    case "PayPal":
      if (builderType === "express") {
        // Express: shipping is handled through the PayPal flow — enableShippingAddress, payLater and intent are locked
        return (
          <PayPalButton
            {...PayPalExpressStyleProps}
            {...buttonStyleOverrides?.paypalExpress}
            {...restCustomOptions}
            enableShippingAddress={true}
            payLater={false}
            intent={"capture" as Intent}
          />
        );
      }
      // Standard: address must be set externally — no address/shipping changes through PayPal
      return (
        <PayPalButton
          flow={"checkout" as FlowType}
          {...PayPalDefaultStyleProps}
          {...buttonStyleOverrides?.paypal}
          {...restCustomOptions}
          enableShippingAddress={false}
          shippingAddressEditable={false}
        />
      );
    case "Venmo":
      return (
        <VenmoButton
          desktopFlow="desktopWebLogin"
          mobileWebFallBack={true}
          paymentMethodUsage="multi_use"
          useTestNonce={true}
          setVenmoUserName={(venmoName) => console.log(venmoName)}
          ignoreBowserSupport={true}
          {...restCustomOptions}
        />
      );

    // --- Express-only vault methods (isPureVault is always true and cannot be overridden by processor settings) ---
    case "PayPalVault":
      return (
        <PayPalButton
          {...PayPalVaultStyleProps}
          {...buttonStyleOverrides?.paypalVault}
          {...restCustomOptions}
          flow={"vault" as FlowType}
          isPureVault={true}
          payLater={false}
          commit={false}
          intent={"tokenize" as Intent}
        />
      );
    case "CreditCardVault":
      return <CreditCardButton {...restCustomOptions} isPureVault={true} />;

    default:
      if (SUPPORTED_LOCAL_PAYMENT_TYPES.includes(paymentMethodType as SupportedLocalPaymentTypes)) {
        return (
          <LocalPaymentMethodButton
            paymentType={paymentMethodType as SupportedLocalPaymentTypes}
            {...restCustomOptions}
          />
        );
      }
      return <CreditCardButton {...restCustomOptions} />;
  }
};

export const RenderTemplate: FC<
  PropsWithChildren<BraintreeBuilderTemplateProps>
> = ({ paymentMethodType, customOptions, builderType }) => {
  return (
    <NotificationsProvider>
      <LoaderProvider>
        <PaymentProvider
          {...customOptions}
          paymentMethodType={paymentMethodType}
          builderType={builderType}
          merchantAccountId={
            customOptions.merchantAccountId?.length
              ? customOptions.merchantAccountId
              : undefined
          }
        >
          <RenderPurchase>
            {ComponentWithCustomOptions({
              paymentMethodType,
              customOptions,
              builderType,
            })}
          </RenderPurchase>
        </PaymentProvider>
      </LoaderProvider>
    </NotificationsProvider>
  );
};
