import React, { useEffect, useState } from "react";
import {
  client as braintreeClient,
  paypalCheckout,
  dataCollector,
} from "braintree-web";
import { FlowType } from "paypal-checkout-components";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import {
  PayPalProps,
  GeneralPayButtonProps,
  PayPalFundingSourcesProp,
} from "../../types";

import { HOSTED_FIELDS_LABEL, renderMaskButtonClasses } from "../../styles";

type PayPalMaskProps = GeneralPayButtonProps & PayPalProps;

type LimitedVaultedPaymentDetails = {
  email: string;
};

type LimitedVaultedPayment = {
  nonce: string;
  details: LimitedVaultedPaymentDetails;
};

const FUNDING_SOURCES = ["paypal"];

export const PayPalMask: React.FC<React.PropsWithChildren<PayPalMaskProps>> = ({
  flow,
  buttonLabel,
  buttonColor,
  payLater,
  payLaterButtonColor,
  locale,
  intent,
  commit,
  enableShippingAddress,
  billingAgreementDescription,
  shippingAddressEditable,
  shippingAddressOverride,
  fullWidth,
  buttonText,
  useKount,
  lineItems,
  shipping,
  shape,
  size,
  tagline,
  height,
  shippingOptions,
  isPureVault = false,
}) => {
  const [limitedVaultedPayments, setLimitedVaultedPaymentMethods] = useState<
    LimitedVaultedPayment[]
  >([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [deviceData, setDeviceData] = useState("");

  const {
    handlePurchase,
    paymentInfo,
    clientToken,
    handlePureVault,
    handleGetVaultedPaymentMethods,
  } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  useEffect(() => {
    if (isPureVault) {
      return;
    }
    const filteredPaymentMethods: Array<LimitedVaultedPayment> = [];
    handleGetVaultedPaymentMethods().then((paymentMethods) => {
      paymentMethods.forEach((paymentMethod) => {
        if (paymentMethod.type === "PayPalAccount") {
          filteredPaymentMethods.push({
            nonce: paymentMethod.nonce,
            details: paymentMethod.details as LimitedVaultedPaymentDetails,
          });
        }
      });
      setLimitedVaultedPaymentMethods(filteredPaymentMethods);
    });
  }, [clientToken]);

  useEffect(() => {
    isLoading(true);

    const isVault: boolean = flow === ("vault" as FlowType);

    const additionalFundingSources: PayPalFundingSourcesProp = {};
    if (payLater) {
      additionalFundingSources["paylater"] = {
        buttonColor: payLaterButtonColor,
      };
    }
    const additionalFundingMethods = Object.keys(
      additionalFundingSources ?? {}
    );

    additionalFundingMethods.map((additionalFundingMethod) => {
      if (!FUNDING_SOURCES.includes(additionalFundingMethod)) {
        FUNDING_SOURCES.push(additionalFundingMethod);
      }
    });

    const enableFunding = additionalFundingMethods.length
      ? {
          "enable-funding": additionalFundingMethods.toString(),
        }
      : {};

    const fundingButtonConfigs: PayPalFundingSourcesProp = {
      paypal: {
        buttonColor: buttonColor,
        buttonLabel: buttonLabel,
      },
      ...(additionalFundingSources ?? {}),
    };

    braintreeClient.create(
      {
        authorization: clientToken,
      },
      function (clientErr, clientInstance) {
        if (clientErr) {
          isLoading(false);
          notify("Error", "Error creating client.");
          return;
        }

        dataCollector.create(
          {
            client: clientInstance,
            paypal: true,
            kount: useKount ?? undefined,
          },
          function (dataCollectorErr, dataCollectorInstance) {
            if (!dataCollectorErr && dataCollectorInstance) {
              setDeviceData(dataCollectorInstance.deviceData);
            }
          }
        );

        paypalCheckout.create(
          {
            client: clientInstance,
          },
          (paypalCheckoutErr, paypalCheckoutInstance) => {
            if (paypalCheckoutErr) {
              isLoading(false);
              notify("Error", "Error in paypal checkout.");
              return;
            }

            paypalCheckoutInstance.loadPayPalSDK(
              isVault
                ? { vault: true }
                : {
                    currency: paymentInfo.currency,
                    intent: intent,
                    ...enableFunding,
                  },
              () => {
                const paypal = global.paypal;

                const handleOnApprove = (data: any, actions: any) => {
                  return paypalCheckoutInstance.tokenizePayment(
                    data,
                    function (err: any, payload: any) {
                      if (isPureVault) {
                        handlePureVault(payload.nonce);
                      } else {
                        handlePurchase(payload.nonce, {
                          deviceData: deviceData,
                          lineItems: lineItems,
                          shipping: shipping,
                          account: {
                            email: payload.details.email,
                          },
                          billing: {
                            firstName: payload.details.firstName,
                            lastName: payload.details.lastName,
                            streetName: payload.details.shippingAddress.line1,
                            streetNumber: payload.details.shippingAddress.line1,
                            city: payload.details.shippingAddress.city,
                            country: payload.details.countryCode,
                            postalCode:
                              payload.details.shippingAddress.postalCode,
                          },
                        });
                      }
                    }
                  );
                };
                const handleOnClose = (data: any) => {
                  notify("Info", "PayPal payment cancelled.");
                };
                const handleOnError = (err: any) => {
                  notify("Info", "PayPal payment cancelled.");
                };

                if (isVault) {
                  paypal
                    .Buttons({
                      style: {
                        label: buttonLabel,
                        color: buttonColor,
                        shape,
                        size,
                        tagline,
                        height,
                      },
                      fundingSource: "paypal",
                      createBillingAgreement: function () {
                        return paypalCheckoutInstance.createPayment({
                          flow: flow,
                          billingAgreementDescription:
                            billingAgreementDescription,
                          enableShippingAddress: enableShippingAddress,
                          shippingAddressEditable: shippingAddressEditable,
                          shippingAddressOverride: shippingAddressOverride,
                        });
                      },

                      onApprove: handleOnApprove,
                      onCancel: handleOnClose,
                      onError: handleOnError,
                    })
                    .render("#paypal-button");
                } else {
                  FUNDING_SOURCES.forEach((fundingSource) => {
                    paypal
                      .Buttons({
                        style: {
                          label:
                            fundingButtonConfigs[fundingSource].buttonLabel,
                          color:
                            fundingButtonConfigs[fundingSource].buttonColor,
                          shape,
                          size,
                          tagline,
                          height,
                        },
                        fundingSource: fundingSource,

                        onShippingChange: function (data: any, actions: any) {
                          if (!shippingOptions) return;

                          const countryCode =
                            data.shipping_address.country_code;
                          if (!countryCode) return actions.reject();

                          const shippingOption = shippingOptions.find(
                            (shippingOption) =>
                              shippingOption.countryCode === countryCode
                          );

                          if (shippingOption) {
                            if (lineItems) {
                              const shippingLineItemIndex =
                                lineItems?.findIndex(
                                  (lineItem) => lineItem.name === "Shipping"
                                );

                              const shippingAmountString =
                                shippingOption.amount.toString();

                              if (
                                shippingLineItemIndex &&
                                shippingLineItemIndex > -1
                              ) {
                                lineItems[shippingLineItemIndex].unitAmount =
                                  shippingAmountString;
                                lineItems[shippingLineItemIndex].totalAmount =
                                  shippingAmountString;
                              } else {
                                lineItems.push({
                                  name: "Shipping",
                                  kind: "debit",
                                  quantity: "1",
                                  totalAmount: shippingAmountString,
                                  unitAmount: shippingAmountString,
                                });
                              }
                            }

                            return paypalCheckoutInstance.updatePayment({
                              amount:
                                paymentInfo.amount + shippingOption.amount,
                              currency: paymentInfo.currency,
                              lineItems: lineItems,
                              paymentId: data.paymentId,
                            });
                          } else {
                            return actions.reject();
                          }
                        },

                        createOrder: () => {
                          return paypalCheckoutInstance.createPayment({
                            flow: flow,
                            locale: locale,
                            amount: paymentInfo.amount,
                            currency: paymentInfo.currency,
                            intent: intent,
                            commit: commit,
                            enableShippingAddress: enableShippingAddress,
                            shippingAddressEditable: shippingAddressEditable,
                            paypalLineItem: lineItems,
                            billingAgreementDescription:
                              billingAgreementDescription,
                            shippingAddressOverride: shippingAddressOverride,
                          });
                        },

                        onApprove: handleOnApprove,
                        onCancel: handleOnClose,
                        onError: handleOnError,
                      } as any)
                      .render("#paypal-button");
                  });
                }
                isLoading(false);
              }
            );
          }
        );
      }
    );
  }, [
    paymentInfo,
    clientToken,
    buttonColor,
    buttonLabel,
    flow,
    payLater,
    payLaterButtonColor,
    commit,
    enableShippingAddress,
    intent,
    isLoading,
    locale,
    lineItems,
    billingAgreementDescription,
    shippingAddressEditable,
    shippingAddressOverride,
    shape,
    size,
    tagline,
    height,
  ]);

  const changeAccount = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSelectedAccount(value);
  };

  const handleVaultedPurchase = async () => {
    isLoading(true);
    await handlePurchase(selectedAccount, {
      deviceData: deviceData,
      lineItems: lineItems,
      shipping: shipping,
    });
    isLoading(false);
  };

  return (
    <>
      {!!limitedVaultedPayments.length && (
        <div className="block w-full">
          {limitedVaultedPayments.map((vaultedMethod, index) => {
            return (
              <div
                key={index}
                className="flex gap-x-5 justify-start content-center border p-2 border-gray-300 rounded my-4"
              >
                <input
                  className="w-3 justify-self-center"
                  id={`credit-card-${index}`}
                  type="radio"
                  name="select-credit-card"
                  value={vaultedMethod.nonce}
                  onChange={changeAccount}
                />
                <label
                  htmlFor={`credit-card-${index}`}
                  className="cursor-pointer w-full"
                >
                  <span className={HOSTED_FIELDS_LABEL}>
                    {vaultedMethod.details.email}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      )}

      {selectedAccount !== "" && (
        <div>
          <button
            onClick={handleVaultedPurchase}
            className={`${renderMaskButtonClasses(
              fullWidth ?? false,
              true,
              false
            )} mb-5`}
          >
            {buttonText}
          </button>
        </div>
      )}
      {selectedAccount === "" && <div id="paypal-button"></div>}
    </>
  );
};
