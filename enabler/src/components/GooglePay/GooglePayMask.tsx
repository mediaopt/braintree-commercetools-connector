import { useEffect, FC, PropsWithChildren, useRef } from "react";
import { client as braintreeClient, googlePayment } from "braintree-web";
import classNames from "classnames";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";
import loadScript from "../../app/loadScript";
import { GooglePayTypes } from "../../types";
import { withBraintreeRef } from "../../helpers/braintreeErrorRef";

// Google Pay's own errors carry a fixed statusCode (e.g. CANCELED, DEVELOPER_ERROR); its statusMessage is
// not logged. Errors from Braintree get the Braintree reference instead.
const withGooglePayRef = (text: string, err: unknown): string => {
  const statusCode = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof statusCode === "string" && /^[A-Z_]{1,40}$/.test(statusCode)
    ? `${text} (Google Pay status code: ${statusCode})`
    : withBraintreeRef(text, err);
};

export const GooglePayMask: FC<PropsWithChildren<GooglePayTypes>> = ({
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
  shipping,
}: GooglePayTypes) => {
  const { handleTransactionSale, paymentInfo, clientToken } = usePayment();
  const effectiveAcquirerCountryCode =
    acquirerCountryCode ?? paymentInfo.countryCode;
  const { notify } = useNotifications();
  const { isLoading } = useLoader();
  const GoogleApiVersion: number = 2;
  const GoogleApiMinorVersion: number = 0;
  const GooglePayVersion: number = 2;

  const googlePayButtonContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientToken) return;
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
              if (googlePaymentErr || !googlePaymentInstance) {
                isLoading(false);
                notify("Error", "Error in google pay checkout.");
                return;
              }
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
                              totalPrice:
                                paymentInfo.braintreeAmount.toString(),
                              // @types/braintree-web's transactionInfo override type omits
                              // countryCode even though it's a real, optional field of Google's
                              // own TransactionInfo (ISO 3166-1 alpha-2; required for merchants
                              // based in the EEA) that Braintree's Google Pay guide documents
                              // passing through here.
                              countryCode: effectiveAcquirerCountryCode,
                            } as google.payments.api.TransactionInfo,
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
                                  const text =
                                    "The Google Pay response could not be processed.";
                                  notify("Error", text);
                                  console.error(withBraintreeRef(text, err));
                                  return;
                                }
                                // Failure is already notified inside handleTransactionSale; its rejection is only for submit()-driven callers.
                                handleTransactionSale(result.nonce, {
                                  lineItems: paymentInfo.braintreeLineItems,
                                  shipping: shipping,
                                }).catch(() => {});
                              },
                            );
                          })
                          .catch(function (err) {
                            const text =
                              "The Google Pay payment was not completed.";
                            notify("Error", text);
                            console.error(withGooglePayRef(text, err));
                          });
                      },
                      buttonColor: buttonTheme,
                      buttonType: buttonType,
                      buttonSizeMode: "fill",
                    });
                    if (googlePayButtonContainer.current) {
                      googlePayButtonContainer.current.appendChild(
                        googlePayButton,
                      );
                    }
                  } else {
                    notify("Error", "Failed payment call. Retry");
                  }
                })
                .catch(function (err) {
                  const text = "Google Pay is not available.";
                  notify("Error", text);
                  console.error(withGooglePayRef(text, err));
                });
            },
          );
        },
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
    effectiveAcquirerCountryCode,
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
