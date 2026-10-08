import { Client, client, ThreeDSecure, threeDSecure } from "braintree-web";
import { useEffect, useState } from "react";
import { usePayment } from "./usePayment";
import { useNotifications } from "./useNotifications";
import { withBraintreeRef } from "../helpers/braintreeErrorRef";

export const useBraintreeClient = () => {
  const { clientToken } = usePayment();
  const [clientInstance, setClientInstance] = useState<Client>();
  const [threeDSecureInstance, setThreeDSecureInstance] =
    useState<ThreeDSecure>();
  const { notify } = useNotifications();

  useEffect(() => {
    if (!clientToken) return;
    client
      .create({
        authorization: clientToken,
      })
      .then(function (braintreeClientInstance) {
        setClientInstance(braintreeClientInstance);
        return threeDSecure.create({
          // "2-inline-iframe" hands the challenge iframe to us rather than
          // letting Cardinal inject its own modal. This is required when the
          // connector runs inside a fixed-position overlay (e.g. CT checkout
          // SDK) that creates a new CSS stacking context, which traps
          // Cardinal's own modal and makes the challenge invisible.
          version: "2-inline-iframe",
          client: braintreeClientInstance,
        });
      })
      .then(function (threeDSecureInstance) {
        threeDSecureInstance.on("lookup-complete", function (_data, next) {
          if (next) {
            next();
          }
        });

        // The challenge iframe is mounted and removed in CreditCardMask.
        setThreeDSecureInstance(threeDSecureInstance);
      })
      .catch(function (err) {
        const text = "3D Secure could not be initialized.";
        notify("Error", text);
        console.error(withBraintreeRef(text, err));
      });
  }, [clientToken]);

  return {
    client: clientInstance,
    threeDS: threeDSecureInstance,
  };
};
