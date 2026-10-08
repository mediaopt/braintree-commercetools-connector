import { useEffect, FC, PropsWithChildren, useRef, RefObject } from "react";
import { hostedFields, dataCollector } from "braintree-web";

import { useBraintreeClient } from "../../app/useBraintreeClient";
import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import {
  GeneralPayButtonProps,
  GeneralCreditCardProps,
  BraintreeShipping,
  BraintreeLineItem,
} from "../../types";

import { HOSTED_FIELDS_LABEL, HOSTED_FIELDS } from "../../styles";
import { withBraintreeRef } from "../../helpers/braintreeErrorRef";
import { HostedFieldsHostedFieldsFieldName } from "braintree-web/hosted-fields";
import { ThreeDSecureVerifyOptions } from "braintree-web/three-d-secure";

type CreditCardMaskProps = GeneralPayButtonProps & GeneralCreditCardProps;

// When the lookup asks for a challenge, it must appear within this time: if Songbird is blocked or
// fails to set up, the SDK never shows it and verifyCard hangs. 10 s is the budget commercetools
// sets for payment-related API extensions:
// https://docs.commercetools.com/api/releases/2021-12-09-increased-maximum-timeout-for-payment-related-api-extensions
export const CHALLENGE_SHOW_TIMEOUT_MS = 10000;

// window.Cardinal (defined by Songbird) isn't announced by Braintree, so it only words the error;
// it never decides whether to reject.
const challengeNotShownError = () => {
  const [code, hint] = (window as { Cardinal?: unknown }).Cardinal
    ? ["THREEDS_CHALLENGE_NOT_SHOWN", ""]
    : [
        "THREEDS_SONGBIRD_NOT_LOADED",
        ": Cardinal's Songbird.js (3D Secure) was not loaded. If you are the domain owner, please whitelist the hosts listed in https://braintree.github.io/braintree-web/current/#content-security-policy",
      ];
  return Object.assign(
    new Error(
      `3D Secure challenge was not shown within ${CHALLENGE_SHOW_TIMEOUT_MS / 1000} s${hint}.`,
    ),
    { code },
  );
};

export const CreditCardMask: FC<PropsWithChildren<CreditCardMaskProps>> = ({
  showPostalCode,
  threeDSAdditionalInformation,
  threeDSBillingAddress,
  showCardHoldersName,
  enableVaulting,
  vaultLabel,
  continueOnLiabilityShiftPossible = false,
  continueOnNoThreeDS = false,
  useKount,
  // PURE_VAULT_DISABLED: isPureVault = false,
  onRegisterSubmit,
  onRegisterValidation,
  onError,
}) => {
  const {
    handleTransactionSale,
    // PURE_VAULT_DISABLED: handlePureVault,
    paymentInfo,
    braintreeCustomerId,
  } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();
  // useRef, not useState: submitPayment/verifyCardAndHandlePurchase are registered once via
  // onRegisterSubmit inside the [client, threeDS] effect below, which only ever fires once — a
  // state closure there would permanently see deviceData as "" from before the collector resolved.
  const deviceDataRef = useRef("");

  const { client, threeDS } = useBraintreeClient();

  const emptyInputsRef = useRef(true);
  const invalidInputRef = useRef(false);

  const ccFormRef = useRef<HTMLFormElement>(null);
  const ccNumberRef = useRef<HTMLDivElement>(null);
  const ccNameRef = useRef<HTMLDivElement>(null);
  const ccCvvRef = useRef<HTMLDivElement>(null);
  const ccPostalRef = useRef<HTMLDivElement>(null);
  const ccExpireRef = useRef<HTMLDivElement>(null);
  const ccVaultCheckbox = useRef<HTMLInputElement>(null);

  const borderClassToggle: Array<string> = ["border-2", "border-rose-600"];

  const FieldKeyMap: {
    [index: string]: RefObject<HTMLDivElement | null>;
  } = {
    number: ccNumberRef,
    cvv: ccCvvRef,
    expirationDate: ccExpireRef,
    cardholderName: ccNameRef,
    postalCode: ccPostalRef,
  };

  // Resolves only once the whole 3DS + transactionSale flow is done and rejects on every failure:
  // Checkout only has submit()'s promise to tell a failed payment apart from a successful one,
  // otherwise it keeps its loader up forever.
  const verifyCardAndHandlePurchase = (
    threeDSecureParameters: ThreeDSecureVerifyOptions,
    shouldVault?: boolean,
  ): Promise<void> => {
    const options: {
      deviceData: string;
      storeInVaultOnSuccess?: boolean;
      lineItems?: BraintreeLineItem[];
      shipping?: BraintreeShipping;
    } = {
      deviceData: deviceDataRef.current,
    };
    if (shouldVault) {
      options.storeInVaultOnSuccess = true;
    }
    if (paymentInfo.braintreeLineItems) {
      options.lineItems = paymentInfo.braintreeLineItems;
    }
    if (paymentInfo.braintreeShipping) {
      options.shipping = paymentInfo.braintreeShipping;
    }
    // Only a challenge needs Songbird, so only a requested challenge starts the timer (public events:
    // lookup-complete asks for it, authentication-iframe-available puts it on the page).
    let timer: ReturnType<typeof setTimeout> | undefined;
    let notShownError: Error | undefined;
    let rejectNotShown!: (error: Error) => void;
    const challengeNotShown = new Promise<never>((_, reject) => {
      rejectNotShown = reject;
    });
    const onLookup = (data?: any) => {
      if (!data?.requiresUserAuthentication) return;
      timer = setTimeout(() => {
        threeDS!.cancelVerifyCard(() => {});
        notShownError = challengeNotShownError();
        rejectNotShown(notShownError);
      }, CHALLENGE_SHOW_TIMEOUT_MS);
    };
    const onShown = () => clearTimeout(timer);
    threeDS!.on("lookup-complete", onLookup);
    threeDS!.on("authentication-iframe-available", onShown);
    const verified = Promise.race([
      threeDS!.verifyCard(threeDSecureParameters),
      challengeNotShown,
    ]).finally(() => {
      clearTimeout(timer);
      threeDS!.off("lookup-complete", onLookup);
      threeDS!.off("authentication-iframe-available", onShown);
    });
    return verified.then(
      function (response: any) {
        if (response.threeDSecureInfo.status !== "authenticate_successful") {
          const message = `Could not authenticate: ${response.threeDSecureInfo.status}`;
          isLoading(false);
          notify("Error", "Could not authenticate");
          onError?.({ code: "3DS_AUTHENTICATION_FAILED", message });
          throw new Error(message);
        }
        if (response.threeDSecureInfo.liabilityShifted) {
          return handleTransactionSale(response.nonce, options);
        } else if (response.threeDSecureInfo.liabilityShiftPossible) {
          if (continueOnLiabilityShiftPossible) {
            return handleTransactionSale(response.nonce, options);
          }
          isLoading(false);
          notify(
            "Warning",
            "Failed the 3D Secure verification. Please use a different payment method.",
          );
          throw new Error("3D Secure liability shift not achieved");
        } else {
          if (continueOnNoThreeDS) {
            return handleTransactionSale(response.nonce, options);
          }
          isLoading(false);
          notify(
            "Warning",
            "3D Secure is not available for your card. Please use a different payment method.",
          );
          throw new Error("3D Secure not available for this card");
        }
      },
      function (error) {
        isLoading(false);
        // `?.` on code too: an error without one (e.g. a TypeError) must still reach notify/onError.
        if (error?.code?.startsWith("THREEDS_LOOKUP")) {
          if (error.code === "THREEDS_LOOKUP_TOKENIZED_CARD_NOT_FOUND_ERROR") {
            notify("Error", "Payment nonce does not exist or was already used");
          } else if (error.code.startsWith("THREEDS_LOOKUP_VALIDATION")) {
            notify(
              "Error",
              "Validation error - check your input or try a different payment",
            );
          } else {
            notify("Error", "Something went wrong - try again");
          }
        } else {
          notify("Error", "Something went wrong - try again");
        }
        // Our own challenge-not-shown error keeps its code and text; anything else gets only our text
        // plus the Braintree reference (see withBraintreeRef). Checkout gets the same sanitized error.
        let sanitized: { code: string; message: string };
        if (error === notShownError) {
          console.error(error.message);
          sanitized = { code: error.code, message: error.message };
        } else {
          sanitized = {
            code: "THREEDS_VERIFY_FAILED",
            message: withBraintreeRef("3D Secure verification failed.", error),
          };
        }
        onError?.(sanitized);
        throw Object.assign(new Error(sanitized.message), {
          code: sanitized.code,
        });
      },
    );
  };

  useEffect(() => {
    if (!client || !threeDS) return;
    isLoading(true);

    let hostedFieldsInputs: object = {
      number: {
        container: "#card-number",
        placeholder: "4111 1111 1111 1111",
      },
      cvv: {
        container: "#cvv",
        placeholder: "123",
      },
      expirationDate: {
        container: "#expiration-date",
        placeholder: "MM/YYYY",
      },
    };

    if (showPostalCode) {
      hostedFieldsInputs = {
        ...hostedFieldsInputs,
        postalCode: {
          container: "#postal-code",
        },
      };
    }

    if (showCardHoldersName) {
      hostedFieldsInputs = {
        ...hostedFieldsInputs,
        cardholderName: {
          container: "#cc-name",
          placeholder: "name",
        },
      };
    }

    hostedFields.create(
      {
        client: client,
        styles: {
          input: {
            "font-size": "16px",
            "font-family": "courier, monospace",
            "font-weight": "lighter",
            color: "#ccc",
          },
          ":focus": {
            color: "black",
          },
          ".valid": {
            color: "#8bdda8",
          },
          ".invalid": {
            color: "#DE7976",
          },
        },
        fields: {
          ...hostedFieldsInputs,
        },
      },
      function (err, hostedFieldsInstance) {
        if (err) {
          isLoading(false);
          notify("Error", "Something went wrong.");
          const message = withBraintreeRef(
            "Credit card fields could not be created.",
            err,
          );
          console.error(message);
          onError?.({ code: "HOSTED_FIELDS_CREATE_FAILED", message });
          return;
        }

        if (!hostedFieldsInstance) {
          isLoading(false);
          notify("Error", "Credit card fields are not available.");
          onError?.({
            code: "HOSTED_FIELDS_UNAVAILABLE",
            message: "Credit card fields are not available.",
          });
          return;
        }
        hostedFieldsInstance.on("notEmpty", function (event) {
          let isEmpty = false;
          let fieldsKey: HostedFieldsHostedFieldsFieldName;
          for (fieldsKey in event.fields) {
            isEmpty = isEmpty || event.fields[fieldsKey].isEmpty;
          }
          emptyInputsRef.current = isEmpty;
        });
        hostedFieldsInstance.on("empty", function () {
          emptyInputsRef.current = true;
        });
        hostedFieldsInstance.on("validityChange", function (event) {
          let isValid = true;
          let fieldsKey: HostedFieldsHostedFieldsFieldName;
          for (fieldsKey in event.fields) {
            const validField =
              event.fields[fieldsKey].isValid ||
              event.fields[fieldsKey].isPotentiallyValid;
            isValid = isValid && validField;
            borderClassToggle.map((classToggle) =>
              FieldKeyMap[fieldsKey].current?.classList.toggle(
                classToggle,
                !validField,
              ),
            );
          }
          invalidInputRef.current = !isValid;
        });

        const showFieldValidation = () => {
          const state = hostedFieldsInstance.getState();
          let fieldsKey: HostedFieldsHostedFieldsFieldName;
          for (fieldsKey in state.fields) {
            const field = state.fields[fieldsKey];
            const validField =
              (field.isValid || field.isPotentiallyValid) && !field.isEmpty;
            borderClassToggle.map((classToggle) =>
              FieldKeyMap[fieldsKey].current?.classList.toggle(
                classToggle,
                !validField,
              ),
            );
          }
        };

        dataCollector.create(
          {
            client: client,
            paypal: true,
            kount: useKount ?? undefined,
          },
          function (dataCollectorErr, dataCollectorInstance) {
            if (!dataCollectorErr && dataCollectorInstance) {
              deviceDataRef.current = dataCollectorInstance.deviceData;
            }
          },
        );

        const submitPayment = (shouldVault: boolean): Promise<void> =>
          new Promise((resolve, reject) => {
            if (emptyInputsRef.current) {
              notify("Error", "Please fill in all card details.");
              return reject(new Error("empty fields"));
            }
            if (invalidInputRef.current) {
              notify("Error", "Please correct the card details and try again.");
              return reject(new Error("invalid fields"));
            }
            isLoading(true);
            hostedFieldsInstance.tokenize(
              { vault: shouldVault },
              function (err, payload) {
                if (err || !payload) {
                  isLoading(false);
                  notify(
                    "Error",
                    "Something went wrong. Check your card details and try again.",
                  );
                  const message = withBraintreeRef(
                    "Card details could not be tokenized.",
                    err,
                  );
                  onError?.({ code: "TOKENIZE_FAILED", message });
                  return reject(
                    Object.assign(new Error(message), {
                      code: "TOKENIZE_FAILED",
                    }),
                  );
                }

                /* PURE_VAULT_DISABLED start — pure vault cancelled; uncomment to re-enable
                if (isPureVault) {
                  handlePureVault(payload.nonce);
                  resolve();
                } else {
                PURE_VAULT_DISABLED end */
                {
                  const threeDSecureParameters: ThreeDSecureVerifyOptions = {
                    amount: `${paymentInfo.braintreeAmount}`,
                    nonce: payload.nonce,
                    bin: payload.details.bin,
                    email: paymentInfo.email,
                    billingAddress: threeDSBillingAddress,
                    additionalInformation: threeDSAdditionalInformation,
                  };
                  verifyCardAndHandlePurchase(
                    threeDSecureParameters,
                    shouldVault,
                  ).then(resolve, reject);
                }
                // PURE_VAULT_DISABLED: } (closing else removed)
              },
            );
          });

        onRegisterSubmit?.((storePaymentDetails) =>
          submitPayment(
            (storePaymentDetails ?? false) ||
              ccVaultCheckbox.current?.checked === true,
          ),
        );
        onRegisterValidation?.({
          isValid: async () =>
            !emptyInputsRef.current && !invalidInputRef.current,
          showValidation: async () => {
            showFieldValidation();
          },
        });
        isLoading(false);
      },
    );
  }, [client, threeDS]);

  return (
    <div className="demo-frame">
      <form
        ref={ccFormRef}
        action="/"
        method="post"
        id="cardForm"
        className="m-auto p-8 max-w-3xl"
      >
        <label className={HOSTED_FIELDS_LABEL} htmlFor="card-number">
          Card Number
        </label>
        <div
          ref={ccNumberRef}
          id="card-number"
          className={`h-12 box-border w-full inline-block shadow-none font-semibold text-sm rounded-md border border-violet-50 leading-5 bg-slate-50 mb-3 px-3`}
        ></div>

        {showCardHoldersName && (
          <>
            <label className={HOSTED_FIELDS_LABEL} htmlFor="cc-name">
              Name
            </label>
            <div
              ref={ccNameRef}
              id="cc-name"
              className={`${HOSTED_FIELDS} p-3`}
            ></div>
          </>
        )}

        <label className={HOSTED_FIELDS_LABEL} htmlFor="expiration-date">
          Expiration Date
        </label>
        <div
          ref={ccExpireRef}
          id="expiration-date"
          className={`${HOSTED_FIELDS} p-3`}
        ></div>

        {showPostalCode && (
          <>
            <label className={HOSTED_FIELDS_LABEL} htmlFor="postal-code">
              Postal code
            </label>
            <div
              ref={ccPostalRef}
              id="postal-code"
              className={`${HOSTED_FIELDS} p-3`}
            ></div>
          </>
        )}

        <label className={HOSTED_FIELDS_LABEL} htmlFor="cvv">
          CVV
        </label>
        <div ref={ccCvvRef} id="cvv" className={`${HOSTED_FIELDS} p-3`}></div>

        {!onRegisterSubmit &&
          enableVaulting &&
          braintreeCustomerId && ( //PURE_VAULT_DISABLED  && !isPureVault
            <>
              <label className={`${HOSTED_FIELDS_LABEL} mb-2`}>
                <input className="mr-3" ref={ccVaultCheckbox} type="checkbox" />
                {vaultLabel ?? "Save my card"}
              </label>
            </>
          )}
      </form>
    </div>
  );
};
