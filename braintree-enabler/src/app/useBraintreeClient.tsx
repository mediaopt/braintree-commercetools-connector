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
    client
      .create({
        authorization: clientToken,
      })
      .then(function (braintreeClientInstance) {
        setClientInstance(braintreeClientInstance);
        return threeDSecure.create({
          version: 2, // Will use 3DS2 whenever possible
          client: braintreeClientInstance,
        });
      })
      .then(function (threeDSecureInstance) {
        threeDSecureInstance.on("lookup-complete", function (data, next) {
          if (next) {
            next();
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
