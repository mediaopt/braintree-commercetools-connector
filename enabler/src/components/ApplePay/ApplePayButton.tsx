import { useEffect, useState, FC } from "react";

import { useNotifications } from "../../app/useNotifications";
import { ApplePayTypes, GeneralPayButtonProps } from "../../types";

import { ApplePayMask } from "./ApplePayMask";

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
        if (window.ApplePaySession.canMakePayments()) {
          setApplyPaySupport(true);
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
