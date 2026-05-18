import { FC } from "react";

import { PAY_BUTTON_TEXT_FALLBACK } from "../PayButton";

import { VenmoMask } from "./VenmoMask";
import { GeneralPayButtonProps, VenmoTypes } from "../../types";
type VenmoButton = VenmoTypes & GeneralPayButtonProps;

export const VenmoButton: FC<VenmoButton> = ({
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
  braintreeLineItems,
  shipping,
}: VenmoButton) => {
  return (
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
      braintreeLineItems={braintreeLineItems}
      shipping={shipping}
    />
  );
};
