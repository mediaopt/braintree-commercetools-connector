import { useEffect, useState, FC } from "react";

import { useNotifications } from "../../app/useNotifications";
import { usePayment } from "../../app/usePayment";
import { PayButtonProps } from "../PayButton";
import { useHandleInitPayment } from "../../app/useHandleInitPayment";
import { ApplePayTypes } from "../../types";

import { ApplePayMask } from "./ApplePayMask";

declare const window: any;

type ApplePayButtonProps = ApplePayTypes & PayButtonProps;

export const ApplePayButton: FC<ApplePayButtonProps> = ({
  disabled,
  fullWidth = true,
  applePayDisplayName,
  lineItems,
  shipping,
  shippingMethodId,
}: ApplePayButtonProps) => {
  const [applyPaySupport, setApplyPaySupport] = useState(false);
  const { clientToken } = usePayment();

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

  useHandleInitPayment(disabled, undefined, shippingMethodId);
  return clientToken && applyPaySupport ? (
    <ApplePayMask
      fullWidth={fullWidth}
      applePayDisplayName={applePayDisplayName}
      lineItems={lineItems}
      shipping={shipping}
    />
  ) : (
    <></>
  );
};
