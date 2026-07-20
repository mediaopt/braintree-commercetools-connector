import { useEffect, useState, useRef, FC, PropsWithChildren } from "react";
import {
  client as braintreeClient,
  paypalCheckout,
  dataCollector,
} from "braintree-web";
import { FlowType } from "paypal-checkout-components";
import { Address as PayPalAddress } from "paypal-checkout-components/modules/callback-data";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import {
  PayPalProps,
  GeneralPayButtonProps,
  PayPalFundingSourcesProp,
  PaymentInfo,
} from "../../types";
import { ExpressAddressData } from "../../payment-enabler/interfaces/express";
import { HOSTED_FIELDS_LABEL } from "../../styles";

import { PayPalCheckoutLoadPayPalSDKOptions } from "braintree-web/paypal-checkout";

type PayPalMaskProps = GeneralPayButtonProps & PayPalProps;

const FUNDING_SOURCES = ["paypal"];

// PayPal's Address has no separate street-number field, so streetName/streetNumber both get line1.
const toExpressAddress = (
  address: PayPalAddress | undefined,
  firstName: string,
  lastName: string,
  email: string,
): ExpressAddressData => ({
  country: address?.countryCode ?? "",
  firstName,
  lastName,
  streetName: address?.line1,
  streetNumber: address?.line1,
  additionalStreetInfo: address?.line2,
  region: address?.state,
  postalCode: address?.postalCode,
  city: address?.city,
  phone: address?.phone,
  email,
});

// Which shipping options (if any) are pre-selected for a country — undefined if none is, so callers
// know to fall back to sending discrete lineItems instead (see buildExpressCreatePaymentOptions).
const getPreSelectedShippingOptions = (
  options: PaymentInfo["shippingOptions"],
  countryCode: string | undefined,
): PaymentInfo["shippingOptions"] => {
  const countryOptions = options?.filter(
    (item) => item.countryCode === countryCode,
  );
  return countryOptions?.some(({ selected }) => selected)
    ? countryOptions
    : undefined;
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
  useKount,
  shipping,
  shape,
  size,
  tagline,
  height,
  // PURE_VAULT_DISABLED: isPureVault = false,
  // enableVaulting is accepted (for prop-passing compatibility) but is currently inert — see
  // PAYPAL_VAULT_DISABLED below; please open an issue if you are interested in this.
  vaultLabel,
  onExpressPayButtonClick,
  onPaymentSubmit,
}) => {
  const [deviceData, setDeviceData] = useState("");
  const paypalVaultCheckbox = useRef<HTMLInputElement>(null);
  // Holds the real clientToken/paymentInfo returned by createExpressPayment (deferred mode only).
  // Read via ref, not React state, so setting it mid-click doesn't retrigger the bootstrap effect
  // below (which depends on paymentInfo/clientToken) while this same click is still in flight.
  const deferredResultRef = useRef<{
    clientToken: string;
    braintreeCustomerId: string;
    paymentInfo: PaymentInfo;
  } | null>(null);

  const {
    handleTransactionSale,
    paymentInfo,
    clientToken,
    // PURE_VAULT_DISABLED: handlePureVault,
    updateCartShipping,
    createExpressPayment,
  } = usePayment();
  const { shippingOptions } = paymentInfo;
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const [updatedTotal, setUpdatedTotal] = useState<string>();

  useEffect(() => {
    if (!clientToken) return;
    isLoading(true);

    const isVault: boolean = flow === ("vault" as FlowType);

    // Builds the shared paypalCheckoutInstance.createPayment(...) args for both createOrder
    // branches below (deferred vs. non-deferred) — they differ only in whether the data comes from
    // the real (post-click) result or the ambient paymentInfo. braintreeLineItems never includes a
    // shipping entry for Express (processor's buildCreatePaymentResponse skips it when isExpress),
    // but amount does include shipping — sending both together trips PayPal's own item_total
    // validation (ITEM_TOTAL_MISMATCH). When a shipping option is pre-selected for the buyer's
    // country, lineItems is omitted and shippingOptions is sent instead; onShippingChange fires
    // immediately after and sets the correct amountBreakdown via updatePayment.
    const buildExpressCreatePaymentOptions = (info: {
      braintreeLineItems: PaymentInfo["braintreeLineItems"];
      shippingOptions: PaymentInfo["shippingOptions"];
      countryCode: string | undefined;
      amount: string | number;
      currency: string;
    }) => {
      const preSelectedOptions = getPreSelectedShippingOptions(
        info.shippingOptions,
        info.countryCode,
      );
      return {
        flow,
        locale,
        lineItems: preSelectedOptions ? undefined : info.braintreeLineItems,
        shippingOptions: preSelectedOptions,
        amount: info.amount,
        currency: info.currency,
        intent,
        enableShippingAddress,
        shippingAddressEditable,
        billingAgreementDescription,
        shippingAddressOverride,
      };
    };

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
                    async function (err: any, payload: any) {
                      //type definition for payload https://braintree.github.io/braintree-web/3.9.0/PayPalCheckout.html#~tokenizePayload
                      /* PURE_VAULT_DISABLED start — pure vault cancelled; uncomment to re-enable
                      if (isPureVault) {
                        handlePureVault(payload.nonce);
                      } else {
                      PURE_VAULT_DISABLED end */
                      {
                        // In deferred mode, deferredResultRef holds the real (post-click)
                        // paymentInfo/ctPaymentId — the ambient paymentInfo is only the mount-time
                        // placeholder seeded from initialAmount.
                        const real = deferredResultRef.current?.paymentInfo;
                        const realShippingOptions =
                          real?.shippingOptions ?? shippingOptions;

                        if (onPaymentSubmit) {
                          await onPaymentSubmit({
                            shippingAddress: toExpressAddress(
                              payload.details.shippingAddress,
                              payload.details.firstName,
                              payload.details.lastName,
                              payload.details.email,
                            ),
                            billingAddress: toExpressAddress(
                              payload.details.billingAddress ??
                                payload.details.shippingAddress,
                              payload.details.firstName,
                              payload.details.lastName,
                              payload.details.email,
                            ),
                            customerEmail: payload.details.email,
                          });
                        }

                        handleTransactionSale(payload.nonce, {
                          deviceData: deviceData,
                          paypalOrderId: data.paymentId,
                          shipping: shipping,
                          storeInVaultOnSuccess:
                            paypalVaultCheckbox.current?.checked === true,
                          braintreePaymentDetails: {
                            braintreeLineItems:
                              real?.braintreeLineItems ??
                              paymentInfo.braintreeLineItems, //discount will be retrieved from the cart at the backend and mapped separately
                            braintreeShipping: payload.shippingAddress,
                            extraShippingCost: payload.shippingOptionId
                              ? realShippingOptions?.find(
                                  ({ id }) => id === payload.shippingOptionId,
                                )?.amount.value
                              : undefined, //only will be returned if shipping was changed inside the PayPal express, then it must be used to update the total payment amount
                          },
                          ctPaymentIdOverride: real?.ctPaymentId,
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
                          // In deferred mode, deferredResultRef holds the real (post-click)
                          // paymentInfo — the ambient paymentInfo/shippingOptions are only the
                          // mount-time placeholder, which never has shippingOptions at all. Same
                          // fallback pattern as handleOnApprove above.
                          const real = deferredResultRef.current?.paymentInfo;
                          const realShippingOptions =
                            real?.shippingOptions ?? shippingOptions;
                          const countryCode =
                            data.shipping_address.country_code ??
                            real?.countryCode ??
                            paymentInfo.countryCode;
                          if (!realShippingOptions?.length)
                            return actions.reject();

                          const relevantShippingOptions =
                            realShippingOptions.filter(
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
                            {
                              country: countryCode,
                              postalCode: data.shipping_address.postal_code,
                              city: data.shipping_address.city,
                              region: data.shipping_address.state,
                            },
                          );
                          setUpdatedTotal(shippingResult.braintreeAmount);
                          return paypalCheckoutInstance.updatePayment({
                            amount: shippingResult.braintreeAmount,
                            currency: real?.currency ?? paymentInfo.currency,
                            lineItems: (
                              real?.braintreeLineItems ??
                              paymentInfo.braintreeLineItems
                            )?.filter(
                              ({ productCode }) => productCode !== "DISCOUNT",
                            ),
                            paymentId: data.paymentId,
                            shippingOptions: braintreeShippingOptions,
                            // amountBreakdown is computed by the processor — see updateCartShipping in
                            // processor/src/services/braintree-payment.service.ts
                            amountBreakdown: shippingResult.amountBreakdown,
                          });
                        },

                        createOrder: async () => {
                          if (onExpressPayButtonClick) {
                            // Deferred mode: Checkout creates the real cart and rebinds the
                            // session to it inside onPayButtonClick — see
                            // https://docs.commercetools.com/checkout/browser-sdk#use-the-onpaybuttonclick-hook.
                            // createExpressPayment then creates the CT Payment for real, against
                            // that cart, since the session now resolves to it.
                            await onExpressPayButtonClick();
                            const result = await createExpressPayment();
                            deferredResultRef.current = result;
                            const real = result.paymentInfo;
                            return paypalCheckoutInstance.createPayment(
                              buildExpressCreatePaymentOptions({
                                braintreeLineItems: real.braintreeLineItems,
                                shippingOptions: real.shippingOptions,
                                countryCode: real.countryCode,
                                amount: real.braintreeAmount,
                                currency: real.currency,
                              }),
                            );
                          }
                          return paypalCheckoutInstance.createPayment(
                            buildExpressCreatePaymentOptions({
                              braintreeLineItems: paymentInfo.braintreeLineItems,
                              shippingOptions,
                              countryCode: paymentInfo.countryCode,
                              amount: updatedTotal ?? paymentInfo.braintreeAmount,
                              currency: paymentInfo.currency,
                            }),
                          );
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
  checkbox ref never attaches when the checkbox isn't rendered. Please open an issue if you are
  interested in vaulting a new PayPal account.
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
