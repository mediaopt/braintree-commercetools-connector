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
  // PURE_VAULT_DISABLED: PayPalVaultStyleProps,
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
import { CreditCardStoredButton } from "../CreditCard/CreditCardStoredButton";
// PAYPAL_STORED_DISABLED: import { PayPalStoredButton } from "../PayPal/PayPalStoredButton";
// ACH_STORED_DISABLED: import { ACHStoredButton } from "../ACH/ACHStoredButton";

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
  // perMethodConfig: from BRAINTREE_PER_METHOD_CONFIG env var via processor /operations/config
  // braintreeEnvironment: "Sandbox" | "Production" from processor config
  const {
    buttonStyleOverrides,
    braintreeEnvironment,
    enableVaulting,
    perMethodConfig,
    ...restCustomOptions
  } = customOptions;
  const isSandbox = braintreeEnvironment !== "Production";

  switch (paymentMethodType) {
    // --- Standard component/dropin methods ---
    case "ACH":
      return (
        <ACHButton
          {...ACHDefaultStyleProps}
          {...buttonStyleOverrides?.ach}
          {...restCustomOptions}
        />
      );
    case "ApplePay":
      return (
        <ApplePayButton
          {...ApplePayDefaultStyleProps}
          {...buttonStyleOverrides?.applePay}
          {...restCustomOptions}
        />
      );
    case "GooglePay":
      return (
        <GooglePayButton
          totalPriceStatus={"FINAL"}
          googleMerchantId={perMethodConfig?.googlePay?.googleMerchantId}
          acquirerCountryCode={perMethodConfig?.googlePay?.acquirerCountryCode}
          environment={isSandbox ? "TEST" : "PRODUCTION"}
          {...buttonStyleOverrides?.googlePay}
          {...restCustomOptions}
        />
      );
    case "PayPal":
      if (builderType === "express") {
        // Express: shipping is handled through the PayPal flow — enableShippingAddress, payLater,  intent and commit are locked
        //commit is locked because the cart is updated on flight and buyer sees the actual final amount at the PayPal side
        return (
          <PayPalButton
            {...PayPalExpressStyleProps}
            {...buttonStyleOverrides?.paypalExpress}
            {...restCustomOptions}
            enableVaulting={false}
            enableShippingAddress={true}
            payLater={false}
            intent={"capture" as Intent}
            commit={true}
          />
        );
      }
      // Standard: address must be set externally — no address/shipping changes through PayPal.
      // commit hardcoded as the final value is submitted to PayPal directly
      return (
        <PayPalButton
          flow={"checkout" as FlowType}
          {...PayPalDefaultStyleProps}
          {...buttonStyleOverrides?.paypal}
          {...restCustomOptions}
          enableVaulting={enableVaulting}
          vaultLabel={perMethodConfig?.paypal?.vaultLabel}
          enableShippingAddress={false}
          shippingAddressEditable={false}
          commit={true}
        />
      );
    case "Venmo":
      return (
        <VenmoButton
          desktopFlow="desktopWebLogin"
          mobileWebFallBack={true}
          paymentMethodUsage="multi_use"
          ignoreBowserSupport={isSandbox}
          {...buttonStyleOverrides?.venmo}
          profile_id={perMethodConfig?.venmo?.profileId}
          useTestNonce={isSandbox}
          {...restCustomOptions}
        />
      );

    // --- Stored payment methods (display + charge vaulted methods) ---
    case "CreditCardStored":
      return <CreditCardStoredButton {...restCustomOptions} />;
    /* PAYPAL_STORED_DISABLED / ACH_STORED_DISABLED start — reusing a saved PayPal account or ACH
    bank account is out of scope for this commercetools Checkout SDK build; see the matching
    disabled branch in payment-enabler-braintree.ts's createStoredPaymentMethodBuilder for why.
    Please open an issue if you are interested in reusing a saved PayPal account or ACH bank account.
    case "PayPalStored":
      return <PayPalStoredButton {...restCustomOptions} />;
    case "ACHStored":
      return <ACHStoredButton {...restCustomOptions} />;
    PAYPAL_STORED_DISABLED / ACH_STORED_DISABLED end */

    // --- Express-only vault methods (isPureVault is always true and cannot be overridden by processor settings) ---
    /* PURE_VAULT_DISABLED start — pure vault cancelled; uncomment to re-enable
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
      return <CreditCardButton {...buttonStyleOverrides?.creditCard} {...restCustomOptions} enableVaulting={enableVaulting} vaultLabel={perMethodConfig?.creditCard?.vaultLabel} isPureVault={true} />;
    PURE_VAULT_DISABLED end */

    default:
      if (
        SUPPORTED_LOCAL_PAYMENT_TYPES.includes(
          paymentMethodType as SupportedLocalPaymentTypes,
        )
      ) {
        return (
          <LocalPaymentMethodButton
            paymentType={paymentMethodType as SupportedLocalPaymentTypes}
            {...restCustomOptions}
          />
        );
      }
      return (
        <CreditCardButton
          {...buttonStyleOverrides?.creditCard}
          {...restCustomOptions}
          enableVaulting={enableVaulting}
          vaultLabel={perMethodConfig?.creditCard?.vaultLabel}
        />
      );
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
