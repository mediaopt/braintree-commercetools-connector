import React from "react";

import { usePayment } from "../../app/usePayment";
import { PayButtonProps, PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";
import { useHandleGetClientToken } from "../../app/useHandleGetClientToken";

import { VenmoMask } from "./VenmoMask";
import { VenmoTypes } from "../../types";
type VenmoButton = VenmoTypes & PayButtonProps;

export const VenmoButton: React.FC<VenmoButton> = ({
  disabled,
  fullWidth = true,
  buttonText,
  desktopFlow,
  paymentMethodUsage,
  mobileWebFallBack,
  allowNewBrowserTab,
  profile_id,
  useTestNonce,
  setVenmoUserName,
  ignoreBowserSupport,
  useKount,
  lineItems,
  shipping,
  shippingMethodId,
}: VenmoButton) => {
  const { clientToken } = usePayment();

  useHandleGetClientToken(disabled, undefined, shippingMethodId);

  return clientToken ? (
    <VenmoMask
      fullWidth={fullWidth}
      buttonText={buttonText ?? PAY_BUTTON_TEXT_FALLBACK}
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
  ) : (
    <></>
  );
};
