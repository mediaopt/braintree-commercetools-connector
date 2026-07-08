import {
  useEffect,
  useState,
  useRef,
  FC,
  PropsWithChildren,
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
} from "../../types";
import { HOSTED_FIELDS_LABEL } from "../../styles";

import { PayPalCheckoutLoadPayPalSDKOptions } from "braintree-web/paypal-checkout";

type PayPalMaskProps = GeneralPayButtonProps & PayPalProps;

const FUNDING_SOURCES = ["paypal"];

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
  useKount,
  shipping,
  shape,
  size,
  tagline,
  height,
  // PURE_VAULT_DISABLED: isPureVault = false,
  enableVaulting = false,
  vaultLabel,
}) => {
  const [deviceData, setDeviceData] = useState("");
  const paypalVaultCheckbox = useRef<HTMLInputElement>(null);

  const {
    handleTransactionSale,
    paymentInfo,
    clientToken,
    // PURE_VAULT_DISABLED: handlePureVault,
    updateCartShipping,
    braintreeCustomerId,
  } = usePayment();
  const { shippingOptions } = paymentInfo;
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const [updatedTotal, setUpdatedTotal] = useState<string>();

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
                      /* PURE_VAULT_DISABLED start — pure vault cancelled; uncomment to re-enable
                      if (isPureVault) {
                        handlePureVault(payload.nonce);
                      } else {
                      PURE_VAULT_DISABLED end */
                      {
                        handleTransactionSale(payload.nonce, {
                          deviceData: deviceData,
                          paypalOrderId: data.paymentId,
                          shipping: shipping,
                          storeInVaultOnSuccess:
                            paypalVaultCheckbox.current?.checked === true,
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
                            braintreeLineItems: paymentInfo.braintreeLineItems, //discount will be retrieved from the cart at the backend and mapped separately
                            braintreeShipping: payload.shippingAddress,
                            extraShippingCost: payload.shippingOptionId
                              ? shippingOptions?.find(
                                  ({ id }) => id === payload.shippingOptionId,
                                )?.amount.value
                              : undefined, //only will be returned if shipping was changed inside the PayPal express, then it must be used to update the total payment amount
                          },
                        });
                      }
                      // PURE_VAULT_DISABLED: } (closing else removed)
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
                          const shippingResult = await updateCartShipping(
                            relevantShippingOptions[activateIndex].id,
                          );
                          setUpdatedTotal(shippingResult.braintreeAmount);
                          return paypalCheckoutInstance.updatePayment({
                            amount: shippingResult.braintreeAmount,
                            currency: paymentInfo.currency,
                            lineItems: paymentInfo.braintreeLineItems?.filter(
                              ({ productCode }) => productCode !== "DISCOUNT",
                            ),
                            paymentId: data.paymentId,
                            shippingOptions: braintreeShippingOptions,
                            // amountBreakdown is computed by the processor — see updateCartShipping in
                            // processor/src/services/braintree-payment.service.ts
                            amountBreakdown: shippingResult.amountBreakdown,
                          });
                        },

                        createOrder: () => {
                          // Filter by the cart's country so only one option can be selected:true.
                          // If a pre-selected option exists, pass shippingOptions to createPayment
                          // and omit lineItems — onShippingChange fires immediately and sets them
                          // via updatePayment with amountBreakdown.
                          // For non-express or no pre-selected shipping, lineItems are sent directly and include discount and shipping.
                          const countryShippingOptions =
                            shippingOptions?.filter(
                              (item) =>
                                item.countryCode === paymentInfo.countryCode,
                            );
                          const preSelectedOptions =
                            countryShippingOptions?.some(
                              ({ selected }) => selected,
                            )
                              ? countryShippingOptions
                              : undefined;
                          return paypalCheckoutInstance.createPayment({
                            flow,
                            locale,
                            lineItems: preSelectedOptions
                              ? undefined
                              : paymentInfo.braintreeLineItems,
                            shippingOptions: preSelectedOptions,
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
    billingAgreementDescription,
    shippingAddressEditable,
    shippingAddressOverride,
    shape,
    size,
    tagline,
    height,
  ]);

  /* PAYPAL_VAULT_DISABLED start — vaulting a new PayPal account is out of scope for this
  commercetools Checkout SDK build (it only supports storing/reusing credit cards). The logic
  below works correctly and can be re-enabled for a custom (non-Checkout-SDK) frontend; forcing
  showVaultCheckbox to false also suppresses storeInVaultOnSuccess further down, since the
  checkbox ref never attaches when the checkbox isn't rendered.
  const showVaultCheckbox = useMemo(
    () =>
      enableVaulting &&
      !!braintreeCustomerId &&
      // PURE_VAULT_DISABLED !isPureVault &&
      flow !== ("vault" as FlowType),
    [enableVaulting, braintreeCustomerId, flow],
  );
  PAYPAL_VAULT_DISABLED end */
  const showVaultCheckbox = false;

  return (
    <div>
      <div id="paypal-button"></div>
      {showVaultCheckbox && (
        <label className={`${HOSTED_FIELDS_LABEL} mb-2`}>
          <input className="mr-3" ref={paypalVaultCheckbox} type="checkbox" />
          {vaultLabel ?? "Save my PayPal account"}
        </label>
      )}
    </div>
  );
};
