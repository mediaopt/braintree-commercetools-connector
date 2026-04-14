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
} from "../Builder/defaultStyles";
import { FlowType } from "paypal-checkout-components";
import { ACHButton } from "../ACH/ACHButton";
import { ApplePayButton } from "../ApplePay/ApplePayButton";
import { CreditCardButton } from "../CreditCard/CreditCardButton";
import { GooglePayButton } from "../GooglePay/GooglePayButton";
import { PayPalButton } from "../PayPal/PayPalButton";
import { VenmoButton } from "../Venmo/VenmoButton";
import { BuilderType } from "../../types";

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
  switch (paymentMethodType) {
    case "ACH":
      return <ACHButton {...ACHDefaultStyleProps} {...customOptions} />;
    case "ApplePay":
      return (
        <ApplePayButton {...ApplePayDefaultStyleProps} {...customOptions} />
      );
    case "GooglePay":
      return (
        <GooglePayButton
          totalPriceStatus={"FINAL"} //todo - move params to options and config and add to options a possobility to set styles params
          googleMerchantId={"merchant-id-from-google"}
          acquirerCountryCode={"DE"}
          environment={"TEST"}
          {...customOptions}
        />
      );
    // case "LocalPaymentMethods":
    //   return <LocalPaymentMethodButton {...customOptions} />
    case "PayPal":
      return (
        <PayPalButton
          flow={"checkout" as FlowType} //fallback flow if is not set by config or options
          {...(`${builderType}` === "express"
            ? PayPalExpressStyleProps
            : PayPalDefaultStyleProps)}
          {...customOptions}
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
          {...customOptions}
        />
      );
    default:
      return <CreditCardButton {...customOptions} />;
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
            paymentMethodType === "LocalPaymentMethod"
              ? customOptions.merchantAccountId
              : undefined
          } //todo - clarify for which methods merchantAccountId is required
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
