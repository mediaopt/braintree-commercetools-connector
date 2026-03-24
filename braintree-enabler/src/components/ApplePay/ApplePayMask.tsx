import React, { useEffect, useState } from "react";
import {
  client as braintreeClient,
  applePay,
  ApplePay,
  ApplePayPayload,
} from "braintree-web";
import classNames from "classnames";
import { useLoader } from "../../app/useLoader";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { GeneralPayButtonProps, ApplePayTypes } from "../../types";

declare const window: any;

type ApplePayMaskProps = ApplePayTypes & GeneralPayButtonProps;

export const ApplePayMask: React.FC<
  React.PropsWithChildren<ApplePayMaskProps>
> = ({
  fullWidth,
  applePayDisplayName,
  lineItems,
  shipping,
}: ApplePayMaskProps) => {
  const [applePayInstanceState, setApplePayInstanceState] =
    useState<ApplePay>();

  const { isLoading } = useLoader();
  const { handlePurchase, paymentInfo, clientToken } = usePayment();
  const { notify } = useNotifications();

  const applePayButtonContainer = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientToken) return;
    isLoading(true);

    braintreeClient.create(
      {
        authorization: clientToken,
      },
      function (clientErr, clientInstance) {
        if (clientErr) {
          notify("Error", "Error creating client");
          return;
        }

        applePay.create(
          {
            client: clientInstance,
          },
          function (applePayErr, applePayInstance) {
            if (applePayErr) {
              notify("Error", "Error creating applePayInstance");
              return;
            }

            setApplePayInstanceState(applePayInstance);
          }
        );
      }
    );
    isLoading(false);
  }, [clientToken]);

  return (
    <div
      className={classNames({
        "w-full": fullWidth,
      })}
      ref={applePayButtonContainer}
    >
      {applePayInstanceState && (
        <button
          onClick={() => {
            const paymentRequest = applePayInstanceState?.createPaymentRequest({
              total: {
                label: applePayDisplayName,
                amount: paymentInfo.amount.toString(),
              },

              requiredBillingContactFields: ["postalAddress"],
            });

            if (paymentRequest) {
              const session = new window.ApplePaySession(3, paymentRequest);

              session.onvalidatemerchant = function (event: any) {
                applePayInstanceState?.performValidation(
                  {
                    validationURL: event.validationURL,
                    displayName: applePayDisplayName,
                  },
                  function (err, merchantSession) {
                    if (err) {
                      notify("Error", "Apple Pay failed to load.");
                      return;
                    }
                    session.completeMerchantValidation(merchantSession);
                  }
                );
              };

              session.onpaymentauthorized = function (event: any) {
                applePayInstanceState?.tokenize(
                  {
                    token: event.payment.token,
                  },
                  function (tokenizeErr, payload?: ApplePayPayload) {
                    if (tokenizeErr) {
                      notify("Error", "Error tokenizing Apple Pay");

                      session.completePayment(
                        window.ApplePaySession.STATUS_FAILURE
                      );
                      return;
                    }

                    if (payload)
                      handlePurchase(payload.nonce, {
                        lineItems: lineItems,
                        shipping: shipping,
                      });

                    session.completePayment(
                      window.ApplePaySession.STATUS_SUCCESS
                    );
                  }
                );
              };

              session.begin();
            } else {
              notify(
                "Error",
                "There is an error in Apple Pay create payment request"
              );
            }
          }}
          type="button"
          className="w-full justify-center text-white bg-primary-900 focus:ring-4 focus:ring-[#050708]/50 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center dark:focus:ring-gray-600 mr-2 mb-2"
        >
          Check out with Apple Pay
          <svg
            className="ml-2 -mr-1 w-5 h-5"
            aria-hidden="true"
            focusable="false"
            data-prefix="fab"
            data-icon="apple"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 384 512"
          >
            <path
              fill="currentColor"
              d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
            ></path>
          </svg>
        </button>
      )}
    </div>
  );
};
