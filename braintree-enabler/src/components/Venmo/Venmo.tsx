import { FC } from "react";

import { RenderTemplate } from "../RenderTemplate";

import { VenmoButton } from "./VenmoButton";

import { GeneralComponentsProps, VenmoTypes } from "../../types";

export type VenmoProps = VenmoTypes & GeneralComponentsProps;

export const Venmo: FC<VenmoProps> = ({
  processorUrl,
  sessionId,
  purchaseCallback,
  mobileWebFallBack,
  paymentMethodUsage,
  desktopFlow,
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
}: VenmoProps) => {
  return (
    <RenderTemplate
      processorUrl={processorUrl}
      sessionId={sessionId}
      taxAmount={taxAmount}
      shippingAmount={shippingAmount}
      discountAmount={discountAmount}
      purchaseCallback={purchaseCallback}
    >
      <VenmoButton
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
      />
    </RenderTemplate>
  );
};
