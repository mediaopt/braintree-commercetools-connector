import { useEffect, useState, FC } from "react";

import { useNotifications } from "../../app/useNotifications";
import { ApplePayTypes, GeneralPayButtonProps } from "../../types";

import { ApplePayMask } from "./ApplePayMask";
import { isApplePaySupported } from "./applePayAvailability";

declare const window: any;

type ApplePayButtonProps = ApplePayTypes & GeneralPayButtonProps;

export const ApplePayButton: FC<ApplePayButtonProps> = ({
  fullWidth = true,
  applePayDisplayName,
  shipping,
}: ApplePayButtonProps) => {
  const [applyPaySupport, setApplyPaySupport] = useState(false);
  const { notify } = useNotifications();

  useEffect(() => {
    try {
      if (!("ApplePaySession" in window)) {
        throw new Error("ApplePaySession");
      } else {
        if (isApplePaySupported()) {
          setApplyPaySupport(true);
        } else {
          // canMakePayments() false — common cause is no card in Apple Wallet (also: Apple Pay
          // disabled in Settings, no Face ID/Touch ID enrolled, Private Browsing, or an Apple ID
          // region that doesn't support Apple Pay).
          // If you're testing in sandbox and don't see the button, make sure at least one valid card is added to Apple Wallet.
          notify(
            "Info",
            "Apple Pay isn't available on this device/browser right now.",
          );
        }
      }
    } catch (err) {
      notify("Error", `This device does not support Apple Pay${", " + err} `);
    }
  }, []);

  return applyPaySupport ? (
    <ApplePayMask
      fullWidth={fullWidth}
      applePayDisplayName={applePayDisplayName}
      shipping={shipping}
    />
  ) : (
    <></>
  );
};
