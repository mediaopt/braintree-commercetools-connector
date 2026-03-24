import React, { useEffect } from "react";
import { client as braintreeClient, googlePayment } from "braintree-web";
import classNames from "classnames";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";
import loadScript from "../../app/loadScript";
import { GooglePayTypes } from "../../types";

export const GooglePayMask: React.FC<
  React.PropsWithChildren<GooglePayTypes>
> = ({
  environment,
  totalPriceStatus,
  googleMerchantId,
  buttonTheme,
  buttonType,
  phoneNumberRequired = false,
  billingAddressFormat = "MIN",
  billingAddressRequired = false,
  acquirerCountryCode,
  fullWidth,
  lineItems,
  shipping,
}: GooglePayTypes) => {
  const { handlePurchase, paymentInfo, clientToken } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();
  const GoogleApiVersion: number = 2;
  const GoogleApiMinorVersion: number = 0;
  const GooglePayVersion: number = 2;

  const googlePayButtonContainer = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    isLoading(true);
    loadScript("https://pay.google.com/gp/p/js/pay.js").then((resolve) => {
      if (!resolve) {
        isLoading(false);
        notify("Error", "Could not load Google Pay");
        return;
      }
      let paymentsClient = new google.payments.api.PaymentsClient({
        environment: environment,
      });

      braintreeClient.create(
        {
          authorization: clientToken,
        },
        function (clientErr, clientInstance) {
          let googlePayCreateOptions = googleMerchantId
            ? {
                googleMerchantId: googleMerchantId,
              }
            : {};
          googlePayment.create(
            {
              client: clientInstance,
              googlePayVersion: GooglePayVersion,
              ...googlePayCreateOptions,
            },
            function (googlePaymentErr, googlePaymentInstance) {
              paymentsClient
                .isReadyToPay({
                  apiVersion: GoogleApiVersion,
                  apiVersionMinor: GoogleApiMinorVersion,
                  allowedPaymentMethods:
                    googlePaymentInstance.createPaymentDataRequest()
                      .allowedPaymentMethods,
                })
                .then(function (response) {
                  if (response.result) {
                    const googlePayButton = paymentsClient.createButton({
                      onClick: (e) => {
                        e.preventDefault();

                        let paymentDataRequest =
                          googlePaymentInstance.createPaymentDataRequest({
                            transactionInfo: {
                              currencyCode: paymentInfo.currency,
                              totalPriceStatus: totalPriceStatus,
                              totalPrice: paymentInfo.amount.toString(),
                              countryCode: acquirerCountryCode,
                            },
                          });

                        let cardPaymentMethod =
                          paymentDataRequest.allowedPaymentMethods[0];
                        cardPaymentMethod.parameters.billingAddressRequired =
                          billingAddressRequired;
                        cardPaymentMethod.parameters.billingAddressParameters =
                          {
                            format: billingAddressFormat,
                            phoneNumberRequired: phoneNumberRequired,
                          };

                        paymentsClient
                          .loadPaymentData(paymentDataRequest)
                          .then((paymentData) => {
                            googlePaymentInstance.parseResponse(
                              paymentData,
                              function (err: any, result: any) {
                                if (err) {
                                  notify("Error", err.message);
                                  return;
                                }
                                handlePurchase(result.nonce, {
                                  lineItems: lineItems,
                                  shipping: shipping,
                                });
                              }
                            );
                          })
                          .catch(function (err) {
                            notify("Error", err.message);
                          });
                      },
                      buttonColor: buttonTheme,
                      buttonType: buttonType,
                      buttonSizeMode: "fill",
                    });
                    if (googlePayButtonContainer.current) {
                      googlePayButtonContainer.current.appendChild(
                        googlePayButton
                      );
                    }
                  } else {
                    notify("Error", "Failed payment call. Retry");
                  }
                })
                .catch(function (err) {
                  notify("Error", err.message);
                });
            }
          );
        }
      );
      isLoading(false);
    });
  }, [
    environment,
    clientToken,
    googleMerchantId,
    buttonTheme,
    buttonType,
    paymentInfo,
    totalPriceStatus,
    phoneNumberRequired,
    billingAddressRequired,
    billingAddressFormat,
    acquirerCountryCode,
  ]);

  return (
    <div
      className={classNames({
        "w-full": fullWidth,
      })}
      ref={googlePayButtonContainer}
    />
  );
};
