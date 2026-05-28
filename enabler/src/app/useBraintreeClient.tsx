import { Client, client, ThreeDSecure, threeDSecure } from "braintree-web";
import { useEffect, useState } from "react";
import { usePayment } from "./usePayment";
import { useNotifications } from "./useNotifications";

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

        threeDSecureInstance.on(
          "authentication-iframe-available",
          function (event: any, next?: () => void) {
            const container = document.createElement("div");
            container.id = "braintree-3ds-container";
            container.className =
              "fixed inset-0 w-full h-full bg-black/50 z-[2147483647] flex items-center justify-center";
            (event.element as HTMLElement).classList.add("bg-white");
            container.appendChild(event.element);
            document.body.appendChild(container);
            if (next) next();
          },
        );

        threeDSecureInstance.on("authentication-modal-close", function () {
          const container = document.getElementById("braintree-3ds-container");
          if (container?.parentNode) {
            container.parentNode.removeChild(container);
          }
        });

        setThreeDSecureInstance(threeDSecureInstance);
      })
      .catch(function (err) {
        notify("Error", err.message);
      });
  }, [clientToken]);

  return {
    client: clientInstance,
    threeDS: threeDSecureInstance,
  };
};
