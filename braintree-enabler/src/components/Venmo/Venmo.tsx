import React from "react";

import { RenderTemplate } from "../RenderTemplate";
import { isPayButtonDisabled } from "../PayButton";

import { VenmoButton } from "./VenmoButton";

import { GeneralComponentsProps, VenmoTypes } from "../../types";

export type VenmoProps = VenmoTypes & GeneralComponentsProps;

export const Venmo: React.FC<VenmoProps> = ({
  mobileWebFallBack,
  paymentMethodUsage,
  desktopFlow,
  createPaymentUrl,
  getClientTokenUrl,
  purchaseUrl,
  purchaseCallback,
  cartInformation,
  fullWidth,
  buttonText,
  allowNewBrowserTab,
  profile_id,
  useTestNonce,
  setVenmoUserName,
  ignoreBowserSupport,
  useKount,
  lineItems,
  shipping,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
  requestHeader,
}: VenmoProps) => {
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
      <VenmoButton
        disabled={isPayButtonDisabled(cartInformation)}
        buttonText={buttonText}
        fullWidth={fullWidth}
        mobileWebFallBack={mobileWebFallBack}
        desktopFlow={desktopFlow}
        paymentMethodUsage={paymentMethodUsage}
        allowNewBrowserTab={allowNewBrowserTab}
        profile_id={profile_id}
        useTestNonce={useTestNonce}
        setVenmoUserName={setVenmoUserName}
        ignoreBowserSupport={ignoreBowserSupport}
        useKount={useKount}
        lineItems={lineItems}
        shipping={shipping}
        shippingMethodId={shippingMethodId}
      />
    </RenderTemplate>
  );
};
