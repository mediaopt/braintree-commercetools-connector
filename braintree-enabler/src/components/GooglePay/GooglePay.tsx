import React from "react";

import { RenderTemplate } from "../RenderTemplate";
import { isPayButtonDisabled } from "../PayButton";

import { GooglePayButton } from "./GooglePayButton";

import { GeneralComponentsProps, GooglePayTypes } from "../../types";

type GooglePayComponentProps = GeneralComponentsProps & GooglePayTypes;

export const GooglePay: React.FC<GooglePayComponentProps> = ({
  createPaymentUrl,
  getClientTokenUrl,
  purchaseUrl,
  purchaseCallback,
  cartInformation,
  fullWidth,
  buttonText,
  environment,
  googleMerchantId,
  totalPriceStatus,
  buttonTheme,
  buttonType,
  billingAddressFormat,
  billingAddressRequired,
  phoneNumberRequired,
  acquirerCountryCode,
  lineItems,
  shipping,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
  requestHeader,
}: GooglePayComponentProps) => {
  return (
    <RenderTemplate
      requestHeader={requestHeader}
      getClientTokenUrl={getClientTokenUrl}
      createPaymentUrl={createPaymentUrl}
      purchaseUrl={purchaseUrl}
      purchaseCallback={purchaseCallback}
      cartInformation={cartInformation}
      taxAmount={taxAmount}
      shippingAmount={shippingAmount}
      discountAmount={discountAmount}
      shippingMethodId={shippingMethodId}
    >
      <GooglePayButton
        disabled={isPayButtonDisabled(cartInformation)}
        buttonText={buttonText}
        fullWidth={fullWidth}
        googleMerchantId={googleMerchantId}
        totalPriceStatus={totalPriceStatus}
        environment={environment}
        buttonType={buttonType}
        buttonTheme={buttonTheme}
        billingAddressFormat={billingAddressFormat}
        billingAddressRequired={billingAddressRequired}
        phoneNumberRequired={phoneNumberRequired}
        acquirerCountryCode={acquirerCountryCode}
        lineItems={lineItems}
        shipping={shipping}
        shippingMethodId={shippingMethodId}
      />
    </RenderTemplate>
  );
};
