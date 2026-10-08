import {
  useEffect,
  useRef,
  useState,
  FC,
  PropsWithChildren,
  MouseEvent,
} from "react";
import {
  client as braintreeClient,
  localPayment,
  LocalPayment,
  dataCollector,
} from "braintree-web";

import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";

import { LocalPaymentMethodsType, GeneralPayButtonProps } from "../../types";
import { useLoader } from "../../app/useLoader";
import { renderMaskButtonClasses } from "../../styles";
import { validateCountryAndCurrency } from "./validateCountryAndCurrency";
import { invalidDataLog } from "./invalidDataLog";
import { withBraintreeRef } from "../../helpers/braintreeErrorRef";

type LocalPaymentMethodMaskType = LocalPaymentMethodsType &
  GeneralPayButtonProps;

export const LocalPaymentMethodMask: FC<
  PropsWithChildren<LocalPaymentMethodMaskType>
> = ({
  paymentType,
  fullWidth = true,
  buttonText,
  merchantAccountId,
  fallbackButtonText,
  shippingAddressRequired,
  useKount,
  shipping,
}: LocalPaymentMethodMaskType) => {
  const [localPaymentInstance, setLocalPaymentInstance] =
    useState<LocalPayment>();
  const [deviceData, setDeviceData] = useState("");

  const paymentButton = useRef<HTMLButtonElement>(null);

  const { handleTransactionSale, paymentInfo, clientToken } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const invokePayment = (e: MouseEvent<HTMLButtonElement>): void => {
    if (
      !paymentInfo.countryCode ||
      !paymentInfo.firstName ||
      !paymentInfo.lastName
    ) {
      notify(
        "Error",
        invalidDataLog([
          !paymentInfo.countryCode && "country",
          !paymentInfo.firstName && "name",
          !paymentInfo.lastName && "last name",
        ]),
      );
      return;
    }
    const { isCountryValid, isCurrencyValid } = validateCountryAndCurrency(
      paymentType,
      paymentInfo.countryCode,
      paymentInfo.currency,
    );
    if (!isCountryValid || !isCurrencyValid) {
      notify(
        "Error",
        invalidDataLog(
          [!isCountryValid && "country", !isCurrencyValid && "currency"],
          "This method is not available for",
        ),
      );
      return;
    }
    let localPaymentId: string | undefined;
    e.preventDefault();
    if (!localPaymentInstance) {
      notify("Error", "No payment instance");
      return;
    }
    isLoading(true);
    localPaymentInstance.startPayment(
      //see https://braintree.github.io/braintree-web/current/LocalPayment.html#~StartPaymentOptions
      {
        paymentType: paymentType,
        amount: paymentInfo.braintreeAmount,
        fallback: {
          url: paymentInfo.fallbackUrl,
          buttonText: fallbackButtonText,
        },
        email: paymentInfo.email,
        givenName: paymentInfo.firstName,
        surname: paymentInfo.lastName,
        countryCode: paymentInfo.countryCode,
        paymentTypeCountryCode: paymentInfo.countryCode,
        currencyCode: paymentInfo.currency,
        shippingAddressRequired: shippingAddressRequired,
        onPaymentStart: function (data, start) {
          localPaymentId = data.paymentId;
          start();
        },
      },
      function (startPaymentError, payload) {
        if (startPaymentError) {
          isLoading(false);
          if (startPaymentError.code === "LOCAL_PAYMENT_POPUP_CLOSED") {
            notify("Error", "Customer closed Local Payment popup.");
          } else {
            const text = "The local payment could not be started.";
            notify("Error", text);
            console.error(withBraintreeRef(text, startPaymentError));
          }
        } else {
          if (payload) {
            const handlePurchaseOptions: { [index: string]: any } = {
              deviceData: deviceData,
              lineItems: paymentInfo.braintreeLineItems,
              shipping: shipping,
              localPaymentId,
            };
            // Failure is already notified inside handleTransactionSale; its rejection is only for submit()-driven callers.
            handleTransactionSale(payload.nonce, handlePurchaseOptions).catch(() => {});
          } else {
            isLoading(false);
            notify("Error", "No payload received");
          }
        }
      },
    );
  };

  useEffect(() => {
    if (!clientToken) return;
    braintreeClient.create(
      {
        authorization: clientToken,
      },
      function (clientError, clientInstance) {
        isLoading(true);
        if (clientError) {
          isLoading(false);
          const text = "There was an error connecting to Braintree.";
          notify("Error", text);
          console.error(withBraintreeRef(text, clientError));
          return;
        }
        const localPaymentAuthOption: any = merchantAccountId
          ? { merchantAccountId: merchantAccountId }
          : { authorization: clientToken };
        localPaymentAuthOption.client = clientInstance;
        localPayment.create(
          localPaymentAuthOption,
          function (localPaymentError, paymentInstance) {
            if (localPaymentError) {
              isLoading(false);
              const text = "The local payment method could not be created.";
              notify("Error", text);
              console.error(withBraintreeRef(text, localPaymentError));
              return;
            }
            dataCollector.create(
              {
                client: clientInstance,
                kount: useKount ?? undefined,
              },
              function (dataCollectorErr, dataCollectorInstance) {
                if (!dataCollectorErr && dataCollectorInstance) {
                  setDeviceData(dataCollectorInstance.deviceData);
                }
              },
            );
            setLocalPaymentInstance(paymentInstance);
            isLoading(false);
          },
        );
      },
    );
  }, [clientToken, merchantAccountId]);

  return (
    <button
      onClick={invokePayment}
      ref={paymentButton}
      className={renderMaskButtonClasses(
        fullWidth,
        !!localPaymentInstance,
        !localPaymentInstance,
      )}
    >
      {buttonText}
    </button>
  );
};
