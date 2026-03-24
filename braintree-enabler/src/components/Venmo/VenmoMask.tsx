import React, { useEffect, useState } from "react";
import {
  client as braintreeClient,
  venmo,
  Venmo,
  dataCollector,
  BraintreeError,
  VenmoTokenizePayload,
} from "braintree-web";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";

import { VenmoTypes, GeneralPayButtonProps } from "../../types";
import classNames from "classnames";

type VenmoMaskType = VenmoTypes & GeneralPayButtonProps;

const TEST_PAYLOAD: VenmoTokenizePayload = {
  nonce: "fake-venmo-account-nonce",
  details: { username: "VenmoJoe" },
  type: "",
};

export const VenmoMask: React.FC<React.PropsWithChildren<VenmoMaskType>> = ({
  paymentMethodUsage,
  desktopFlow,
  mobileWebFallBack,
  allowNewBrowserTab = true,
  profile_id,
  fullWidth = true,
  buttonText,
  useTestNonce,
  setVenmoUserName,
  ignoreBowserSupport,
  useKount,
  lineItems,
  shipping,
}: VenmoMaskType) => {
  const { handlePurchase, paymentInfo, clientToken } = usePayment();
  const { notify } = useNotifications();
  const [displayButton, setDisplayButton] = useState(false);
  const [venmoDisabled, setVenmoDisabled] = useState(false);
  const [currentVenmoInstance, setVenmoInstance] = useState<Venmo>();
  const [deviceData, setDeviceData] = useState("");

  const venmoForm = React.useRef<HTMLFormElement>(null);

  const handleVenmoError = (err: BraintreeError) => {
    if (err.code === "VENMO_CANCELED") {
      notify("Error", "App is not available or user aborted payment flow");
    } else if (err.code === "VENMO_APP_CANCELED") {
      notify("Error", "User canceled payment flow");
    } else {
      notify("Error", err.message);
    }
  };

  const handleVenmoSuccess = (payload: VenmoTokenizePayload) => {
    handlePurchase(payload.nonce, {
      deviceData: deviceData,
      lineItems: lineItems,
      shipping: shipping,
    });
    setVenmoUserName(payload.details.username);
  };

  const clickVenmoButton = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVenmoInstance) return;
    setVenmoDisabled(true);

    currentVenmoInstance.tokenize({}, (tokenizeErr, payload) => {
      setVenmoDisabled(false);

      if (useTestNonce) {
        handleVenmoSuccess(TEST_PAYLOAD);
        return;
      } else if (tokenizeErr) {
        handleVenmoError(tokenizeErr);
      } else if (payload) {
        handleVenmoSuccess(payload);
      } else {
        notify("Error", "Couldn't create payment");
      }
    });
  };

  useEffect(() => {
    braintreeClient.create(
      {
        authorization: clientToken,
      },
      function (clientErr, clientInstance) {
        if (clientErr) {
          notify("Error", "Error creating client" + clientErr.message);
          return;
        }

        dataCollector.create(
          {
            client: clientInstance,
            paypal: true,
            kount: useKount ?? undefined,
          },
          function (dataCollectorErr, dataCollectorInstance) {
            if (dataCollectorErr || !dataCollectorInstance) {
              return;
            }
            setDeviceData(dataCollectorInstance.deviceData);
          }
        );

        let venmoFlowOption: any =
          desktopFlow === "desktopWebLogin"
            ? { allowDesktopWebLogin: true }
            : { allowDesktop: true };

        if (!allowNewBrowserTab) {
          venmoFlowOption = { ...venmoFlowOption, allowNewBrowserTab: false };
        }
        if (profile_id) {
          venmoFlowOption = { ...venmoFlowOption, profileId: profile_id };
        }

        venmo.create(
          {
            client: clientInstance,
            mobileWebFallBack: mobileWebFallBack,
            paymentMethodUsage: paymentMethodUsage,
            ...venmoFlowOption,
          },
          function (venmoErr, venmoInstance) {
            if (venmoErr) {
              notify("Error", "Error creating Venmo:" + venmoErr.message);
              return;
            }
            if (!venmoInstance.isBrowserSupported()) {
              if (!ignoreBowserSupport) {
                notify("Error", "Browser does not support Venmo");
                return;
              }
              notify(
                "Warning",
                "Browser does not support Venmo - will be ignored due to settings"
              );
            }

            setDisplayButton(true);
            setVenmoInstance(venmoInstance);
            if (!allowNewBrowserTab) {
              return;
            }

            if (venmoInstance.hasTokenizationResult()) {
              venmoInstance.tokenize(function (
                tokenizeErr: BraintreeError | undefined,
                payload: VenmoTokenizePayload | undefined
              ) {
                if (useTestNonce) {
                  handleVenmoSuccess(TEST_PAYLOAD);
                  return;
                } else if (tokenizeErr) {
                  handleVenmoError(tokenizeErr);
                } else if (payload) {
                  handleVenmoSuccess(payload);
                } else {
                  notify("Error", "Couldn't create payment");
                }
              });
              return;
            }
          }
        );
      }
    );
  }, [
    paymentInfo,
    clientToken,
    paymentMethodUsage,
    desktopFlow,
    mobileWebFallBack,
  ]);

  return (
    <form onSubmit={clickVenmoButton} ref={venmoForm}>
      <button
        disabled={venmoDisabled}
        type="submit"
        className={classNames({
          "justify-center align-center rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-white bg-blue-500 hover:bg-blue-600  shadow-sm":
            true,
          "w-full": fullWidth,
          hidden: !displayButton,
        })}
        id="submit"
      >
        {buttonText}
      </button>
    </form>
  );
};
