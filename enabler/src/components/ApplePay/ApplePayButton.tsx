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
          // TODO: remove before production — temporary confirmation that the device/browser
          // capability check passed, so failures further down the chain (clientToken,
          // applePay.create) aren't confused with this check.
          notify("Info", "Apple Pay debug: device/browser capability check passed (canMakePayments true).");
        } else {
          // TODO: remove before production — this branch was previously silent: ApplePaySession
          // existed but canMakePayments() returned false, so the button never appeared and nothing
          // told you why. Common causes: no card in Apple Wallet, Apple Pay disabled in Settings,
          // no Face ID/Touch ID enrolled, Private Browsing, or an Apple ID region that doesn't
          // support Apple Pay.
          notify(
            "Error",
            "Apple Pay debug: ApplePaySession exists but canMakePayments() returned false — device/browser is not eligible right now.",
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
