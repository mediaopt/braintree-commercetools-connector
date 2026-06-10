import {
  useEffect,
  useState,
  FC,
  PropsWithChildren,
  ChangeEvent,
  useMemo,
} from "react";
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
  LineItemKind,
} from "../../types";

import { HOSTED_FIELDS_LABEL, renderMaskButtonClasses } from "../../styles";
import { PayPalCheckoutLoadPayPalSDKOptions } from "braintree-web/paypal-checkout";

type PayPalMaskProps = GeneralPayButtonProps & PayPalProps;

type LimitedVaultedPaymentDetails = {
  email: string;
};

type LimitedVaultedPayment = {
  nonce: string;
  details: LimitedVaultedPaymentDetails;
};

const FUNDING_SOURCES = ["paypal"];

const lineItemPlaceholders = {
  quantity: "1",
  unitTaxAmount: "0.00",
  description: "",
  url: "",
};


export const PayPalMask: FC<PropsWithChildren<PayPalMaskProps>> = ({
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
  shipping,
  shape,
  size,
  tagline,
  height,
  isPureVault = false,
}) => {
  const [limitedVaultedPayments, setLimitedVaultedPaymentMethods] = useState<
    LimitedVaultedPayment[]
  >([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [deviceData, setDeviceData] = useState("");

  const {
    handleTransactionSale,
    paymentInfo,
    clientToken,
    handlePureVault,
    handleGetVaultedPaymentMethods,
    updateCartShipping,
  } = usePayment();
  const { shippingOptions } = paymentInfo;
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const [updatedTotal, setUpdatedTotal] = useState<string>();
  const [updatedDiscount, setUpdatedDiscount] = useState<string>();

  // When shipping changes on express flow, the discount amount in braintreeLineItems may also change,
  // or a discount may appear that wasn't present at payment creation
  const extendedItems = useMemo(() => {
    const items = paymentInfo.braintreeLineItems;
    if (!items || !updatedDiscount) return items;
    const hasDiscount = items.some((item) => item.productCode === "DISCOUNT");
    if (hasDiscount) {
      return items.map((item) =>
        item.productCode === "DISCOUNT"
          ? { ...item, unitAmount: updatedDiscount, totalAmount: updatedDiscount }
          : item,
      );
    }
    return [
      ...items,
      {
        name: "Discount",
        kind: LineItemKind.Credit,
        unitAmount: updatedDiscount,
        totalAmount: updatedDiscount,
        productCode: "DISCOUNT",
        ...lineItemPlaceholders,
      },
    ];
  }, [paymentInfo.braintreeLineItems, updatedDiscount]);

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
    if (!clientToken) return;
    isLoading(true);

    const isVault: boolean = flow === ("vault" as FlowType);

    const additionalFundingSources: PayPalFundingSourcesProp = {};
    if (payLater) {
      additionalFundingSources["paylater"] = {
        buttonColor: payLaterButtonColor,
      };
    }
    const additionalFundingMethods = Object.keys(
      additionalFundingSources ?? {},
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
          },
        );

        paypalCheckout.create(
          {
            client: clientInstance,
          },
          (paypalCheckoutErr, paypalCheckoutInstance) => {
            if (paypalCheckoutErr || !paypalCheckoutInstance) {
              isLoading(false);
              notify("Error", "Error in paypal checkout.");
              return;
            }

            paypalCheckoutInstance.loadPayPalSDK(
              isVault
                ? { vault: true }
                : ({
                    currency: paymentInfo.currency,
                    intent: intent,
                    ...enableFunding,
                  } as PayPalCheckoutLoadPayPalSDKOptions),
              () => {
                //const paypal = global.paypal;

                const handleOnApprove = (data: any, actions: any) => {
                  return paypalCheckoutInstance.tokenizePayment(
                    data,
                    function (err: any, payload: any) {
                      //type definition for payload https://braintree.github.io/braintree-web/3.9.0/PayPalCheckout.html#~tokenizePayload
                      if (isPureVault) {
                        handlePureVault(payload.nonce);
                      } else {
                        handleTransactionSale(payload.nonce, {
                          deviceData: deviceData,
                          shipping: shipping,
                          account: {
                            email: payload.details.email,
                          },
                          billing: {
                            //todo - sync cart shipping address and shipping method id if relevant
                            firstName: payload.details.firstName,
                            lastName: payload.details.lastName,
                            streetName: payload.details.shippingAddress.line1,
                            streetNumber: payload.details.shippingAddress.line1,
                            city: payload.details.shippingAddress.city,
                            country: payload.details.countryCode,
                            postalCode:
                              payload.details.shippingAddress.postalCode,
                          },
                          braintreePaymentDetails: {
                            braintreeLineItems: extendedItems,
                            braintreeShipping: payload.shippingAddress,
                            extraShippingCost: payload.shippingOptionId
                              ? shippingOptions?.find(
                                  ({ id }) => id === payload.shippingOptionId,
                                )?.amount.value
                              : undefined, //only will be returned if shipping was changed inside the PayPal express, then it must be used to update the total payment amount
                          },
                        });
                      }
                    },
                  );
                };
                const handleOnClose = (data: any) => {
                  notify("Info", "PayPal payment cancelled.");
                };
                const handleOnError = (err: any) => {
                  notify("Info", "PayPal payment cancelled.");
                };

                if (isVault) {
                  // @ts-ignore
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
                          billingAgreementDescription,
                          enableShippingAddress,
                          shippingAddressEditable,
                          shippingAddressOverride,
                        });
                      },
                      //@ts-ignore
                      onApprove: handleOnApprove, //fixme - resolve type
                      onCancel: handleOnClose,
                      onError: handleOnError,
                    })
                    .render("#paypal-button");
                } else {
                  FUNDING_SOURCES.forEach((fundingSource) => {
                    // @ts-ignore
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

                        onShippingChange: async function (
                          data: any,
                          actions: any,
                        ) {
                          //data definition can be found here https://developer.paypal.com/sdk/js/reference/#onshippingchange
                          //todo - verify when should this method be replaced with new atlernatives https://developer.paypal.com/sdk/js/reference/#onshippingchange
                          const countryCode =
                            data.shipping_address.country_code;
                          if (!shippingOptions?.length) return actions.reject();

                          const relevantShippingOptions =
                            shippingOptions.filter(
                              (item) => item.countryCode === countryCode,
                            );
                          if (!relevantShippingOptions.length)
                            return actions.reject();

                          const initSelectedMethod = shippingOptions.find(
                            ({ selected }) => selected,
                          );

                          const selectedOptionIndex =
                            relevantShippingOptions.findIndex(
                              ({ id, label }) =>
                                id === data.selected_shipping_option?.id &&
                                label === data.selected_shipping_option?.label,
                            );
                          const activateIndex =
                            selectedOptionIndex >= 0 ? selectedOptionIndex : 0;

                          const braintreeShippingOptions =
                            relevantShippingOptions.map(
                              ({ id, type, label, amount }, index) => ({
                                id,
                                type,
                                label,
                                selected: index === activateIndex,
                                amount,
                              }),
                            );

                          if (
                            initSelectedMethod?.id !==
                            relevantShippingOptions[activateIndex].id
                          ) {
                            const shippingResult = await updateCartShipping(
                              relevantShippingOptions[activateIndex].id,
                            );
                            setUpdatedTotal(shippingResult.braintreeAmount);
                            setUpdatedDiscount(shippingResult.discountAmount);
                            return paypalCheckoutInstance.updatePayment({
                              amount: shippingResult.braintreeAmount,
                              currency: paymentInfo.currency,
                              lineItems: extendedItems,
                              paymentId: data.paymentId,
                              shippingOptions: braintreeShippingOptions,
                            });
                          } //shipping id matters for the final amount and can be influences by other props like cart discount so it must be updated prior to PayPal payment
                          //address doesn't influence the payment directly - only if it forces the shipping to change, so it could be synced at transactionSale step on the processor if shipping method doesn't need to change
                        },

                        createOrder: () => {
                          return paypalCheckoutInstance.createPayment({
                            flow: flow,
                            locale: locale,
                            lineItems: extendedItems,
                            amount: updatedTotal ?? paymentInfo.braintreeAmount,
                            currency: paymentInfo.currency,
                            intent,
                            enableShippingAddress,
                            shippingAddressEditable,
                            billingAgreementDescription,
                            shippingAddressOverride,
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
              },
            );
          },
        );
      },
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
    paymentInfo.braintreeLineItems,
    billingAgreementDescription,
    shippingAddressEditable,
    shippingAddressOverride,
    shape,
    size,
    tagline,
    height,
  ]);

  const changeAccount = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSelectedAccount(value);
  };

  const handleVaultedPurchase = async () => {
    isLoading(true);
    await handleTransactionSale(selectedAccount, {
      deviceData: deviceData,
      lineItems: paymentInfo.braintreeLineItems,
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
              false,
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
