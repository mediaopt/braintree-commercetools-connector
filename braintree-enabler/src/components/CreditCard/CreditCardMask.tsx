import React, { useEffect, useState } from "react";
import classNames from "classnames";
import { hostedFields, dataCollector } from "braintree-web";
import { ThreeDSecureVerifyOptions } from "braintree-web/modules/three-d-secure";

import { useBraintreeClient } from "../../app/useBraintreeClient";
import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";
import {
  HostedFieldsAccountDetails,
  HostedFieldsHostedFieldsFieldName,
} from "braintree-web/modules/hosted-fields";

import {
  GeneralPayButtonProps,
  GeneralCreditCardProps,
  LineItems,
  Shipping,
} from "../../types";

import {
  HOSTED_FIELDS_LABEL,
  HOSTED_FIELDS,
  renderMaskButtonClasses,
} from "../../styles";

type CreditCardMaskProps = GeneralPayButtonProps & GeneralCreditCardProps;

type LimitedVaultedPayment = {
  nonce: string;
  details: HostedFieldsAccountDetails;
};

type SelectedCardType =
  | {
      nonce: string;
      bin: string;
    }
  | "new"
  | "";

export const CreditCardMask: React.FC<
  React.PropsWithChildren<CreditCardMaskProps>
> = ({
  fullWidth = true,
  buttonText,
  showPostalCode,
  threeDSAdditionalInformation,
  threeDSBillingAddress,
  showCardHoldersName,
  enableVaulting,
  continueOnLiabilityShiftPossible = false,
  continueOnNoThreeDS = false,
  useKount,
  lineItems,
  shipping,
  isPureVault = false,
}) => {
  const {
    handlePurchase,
    handlePureVault,
    paymentInfo,
    handleGetVaultedPaymentMethods,
    braintreeCustomerId,
  } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();
  const [hostedFieldsCreated, setHostedFieldsCreated] = useState(false);
  const [showNewCreditCardForm, setShowNewCreditCardForm] = useState(false);
  const [emptyInputs, setEmptyInputs] = useState<boolean>(true);
  const [invalidInput, setInvalidInput] = useState<boolean>(false);
  const [deviceData, setDeviceData] = useState("");
  const [limitedVaultedPayments, setLimitedVaultedPaymentMethods] = useState<
    LimitedVaultedPayment[]
  >([]);
  const [selectedCard, setSelectedCard] = useState<SelectedCardType>("");

  const { client, threeDS } = useBraintreeClient();

  const ccFormRef = React.useRef<HTMLFormElement>(null);
  const ccNumberRef = React.useRef<HTMLDivElement>(null);
  const ccNameRef = React.useRef<HTMLDivElement>(null);
  const ccCvvRef = React.useRef<HTMLDivElement>(null);
  const ccPostalRef = React.useRef<HTMLDivElement>(null);
  const ccExpireRef = React.useRef<HTMLDivElement>(null);
  const ccVaultCheckbox = React.useRef<HTMLInputElement>(null);

  const borderClassToggle: Array<string> = ["border-2", "border-rose-600"];

  const FieldKeyMap: {
    [index: string]: React.RefObject<HTMLDivElement>;
  } = {
    number: ccNumberRef,
    cvv: ccCvvRef,
    expirationDate: ccExpireRef,
    cardholderName: ccNameRef,
    postalCode: ccPostalRef,
  };
  const handleGetVaultedPaymentMethodsByType = (type: string) => {
    if (isPureVault) {
      setHostedFieldsCreated(true);
      return;
    }
    const filteredPaymentMethods: Array<LimitedVaultedPayment> = [];
    handleGetVaultedPaymentMethods()
      .then((paymentMethods) => {
        paymentMethods.forEach((paymentMethod) => {
          if (paymentMethod.type === type) {
            filteredPaymentMethods.push({
              nonce: paymentMethod.nonce,
              details: paymentMethod.details as HostedFieldsAccountDetails,
            });
          }
        });
        setLimitedVaultedPaymentMethods(filteredPaymentMethods);
      })
      .finally(() => setHostedFieldsCreated(true));
  };

  const verifyCardAndHandlePurchase = (
    threeDSecureParameters: ThreeDSecureVerifyOptions,
    shouldVault?: boolean
  ) => {
    const options: {
      deviceData: string;
      shouldVault?: boolean;
      lineItems?: LineItems;
      shipping?: Shipping;
    } = {
      deviceData: deviceData,
    };
    if (shouldVault) {
      options.shouldVault = true;
    }
    if (lineItems) {
      options.lineItems = lineItems;
    }
    if (shipping) {
      options.shipping = shipping;
    }
    threeDS!
      .verifyCard(threeDSecureParameters)
      .then(function (response: any) {
        if (response.threeDSecureInfo.status !== "authenticate_successful") {
          isLoading(false);
          notify("Error", "Could not authenticate");
          return;
        }
        if (response.threeDSecureInfo.liabilityShifted) {
          handlePurchase(response.nonce, options);
        } else if (response.threeDSecureInfo.liabilityShiftPossible) {
          if (continueOnLiabilityShiftPossible) {
            handlePurchase(response.nonce, options);
          } else {
            notify(
              "Warning",
              "Failed the 3D Secure verification. Please use a different payment method."
            );
          }
        } else {
          if (continueOnNoThreeDS) {
            handlePurchase(response.nonce, options);
          } else {
            notify(
              "Warning",
              "3D Secure is not available for your card. Please use a different payment method."
            );
          }
        }
      })
      .catch(function (error) {
        isLoading(false);
        if (error?.code.indexOf("THREEDS_LOOKUP") === 0) {
          if (error.code === "THREEDS_LOOKUP_TOKENIZED_CARD_NOT_FOUND_ERROR") {
            notify("Error", "Payment nonce does not exist or was already used");
          } else if (error.code.indexOf("THREEDS_LOOKUP_VALIDATION") === 0) {
            notify(
              "Error",
              "Validation error - check your input or try a different payment"
            );
          } else {
            notify("Error", "Something went wrong - try again");
          }
        } else {
          notify("Error", "Something went wrong - try again");
        }
      });
  };

  useEffect(() => {
    if (!client || !threeDS) return;
    isLoading(true);
    const form = ccFormRef.current;

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
          console.error(err);
          return;
        }

        if (!hostedFieldsInstance || !form) {
          isLoading(false);
          notify("Error", "Credit card fields are not available.");
          return;
        }
        hostedFieldsInstance.on("notEmpty", function (event) {
          let isEmpty = false;
          let fieldsKey: HostedFieldsHostedFieldsFieldName;
          for (fieldsKey in event.fields) {
            isEmpty = isEmpty || event.fields[fieldsKey].isEmpty;
          }
          setEmptyInputs(isEmpty);
        });
        hostedFieldsInstance.on("empty", function (event) {
          setEmptyInputs(true);
        });
        hostedFieldsInstance.on("validityChange", function (event) {
          let isValid = true;
          let fieldsKey: HostedFieldsHostedFieldsFieldName;
          for (fieldsKey in event.fields) {
            let validField =
              event.fields[fieldsKey].isValid ||
              event.fields[fieldsKey].isPotentiallyValid;
            isValid = isValid && validField;
            borderClassToggle.map((classToggle) =>
              FieldKeyMap[fieldsKey].current?.classList.toggle(
                classToggle,
                !validField
              )
            );
          }
          setInvalidInput(!isValid);
        });

        dataCollector.create(
          {
            client: client,
            paypal: true,
            kount: useKount ?? undefined,
          },
          function (dataCollectorErr, dataCollectorInstance) {
            if (!dataCollectorErr && dataCollectorInstance) {
              setDeviceData(dataCollectorInstance.deviceData);
            }
          }
        );

        var tokenize = function (event: any) {
          event.preventDefault();

          isLoading(true);
          const shouldVault = ccVaultCheckbox.current?.checked || false;

          hostedFieldsInstance.tokenize(
            { vault: shouldVault },
            function (err, payload) {
              if (err || !payload) {
                isLoading(false);
                notify(
                  "Error",
                  "Something went wrong. Check your card details and try again."
                );
                return;
              }

              if (isPureVault) {
                handlePureVault(payload.nonce);
              } else {
                let threeDSecureParameters: ThreeDSecureVerifyOptions = {
                  amount: paymentInfo.amount,
                  nonce: payload.nonce,
                  bin: payload.details.bin,
                  email: paymentInfo.cartInformation.account.email,
                  billingAddress: threeDSBillingAddress,
                  additionalInformation: threeDSAdditionalInformation,
                };
                verifyCardAndHandlePurchase(
                  threeDSecureParameters,
                  shouldVault
                );
              }
            }
          );
        };
        form.addEventListener("submit", tokenize, false);
        handleGetVaultedPaymentMethodsByType("CreditCard");
        isLoading(false);
      }
    );
  }, [client, threeDS]);

  const changeCard = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    const checkNew = value === -1;
    if (checkNew) {
      setSelectedCard("new");
    } else {
      const vaultedPayment = limitedVaultedPayments[value];
      setSelectedCard({
        nonce: vaultedPayment.nonce,
        bin: vaultedPayment.details.bin,
      });
    }
    setShowNewCreditCardForm(checkNew);
  };

  const submitVaultedCard = async () => {
    if (!threeDS) {
      notify("Error", "3D Secure could not load");
      return;
    }
    if (selectedCard === "" || selectedCard === "new") {
      notify("Error", "An error occurred");
      return;
    }
    isLoading(true);
    let threeDSecureParameters: ThreeDSecureVerifyOptions = {
      amount: paymentInfo.amount,
      nonce: selectedCard!.nonce,
      bin: selectedCard!.bin,
      email: paymentInfo.cartInformation.account.email,
      billingAddress: threeDSBillingAddress,
      additionalInformation: threeDSAdditionalInformation,
    };
    verifyCardAndHandlePurchase(threeDSecureParameters);
    isLoading(false);
  };

  useEffect(() => {
    if (!hostedFieldsCreated || limitedVaultedPayments.length) {
      setShowNewCreditCardForm(false);
      setSelectedCard("");
      return;
    }
    setShowNewCreditCardForm(true);
    setSelectedCard("new");
  }, [limitedVaultedPayments, hostedFieldsCreated]);

  return (
    <>
      <>
        {!!limitedVaultedPayments.length && (
          <div className="block w-full">
            <>
              {limitedVaultedPayments.map((vaultedMethod, index) => {
                return (
                  <div
                    key={index}
                    className="flex gap-x-5 justify-start content-center border p-2 border-gray-300 rounded mt-4"
                  >
                    <input
                      className="w-3 justify-self-center"
                      id={`credit-card-${index}`}
                      type="radio"
                      name="select-credit-card"
                      value={index}
                      onChange={changeCard}
                    />
                    <label
                      htmlFor={`credit-card-${index}`}
                      className="cursor-pointer w-full"
                    >
                      <span className={HOSTED_FIELDS_LABEL}>
                        {vaultedMethod.details.cardType}
                      </span>
                      <span className={HOSTED_FIELDS_LABEL}>
                        **** **** **** {vaultedMethod.details.lastFour}
                      </span>
                      <span className={HOSTED_FIELDS_LABEL}>
                        {vaultedMethod.details.cardholderName}
                      </span>
                      <span className={HOSTED_FIELDS_LABEL}>
                        {vaultedMethod.details.expirationMonth} /{" "}
                        {vaultedMethod.details.expirationYear}
                      </span>
                    </label>
                  </div>
                );
              })}
            </>

            <label className={`${HOSTED_FIELDS_LABEL} mt-2 mb-2`}>
              <input
                type="radio"
                name="select-credit-card"
                value="-1"
                onChange={changeCard}
                className="mr-2"
              />
              new credit card
            </label>
          </div>
        )}
      </>
      <div
        className={classNames({
          "demo-frame": true,
          hidden: !showNewCreditCardForm,
        })}
      >
        <form
          ref={ccFormRef}
          action="/"
          method="post"
          id="cardForm"
          className="m-auto p-8 max-w-screen-md"
        >
          <label className={HOSTED_FIELDS_LABEL} htmlFor="card-number">
            Card Number
          </label>
          <div
            ref={ccNumberRef}
            id="card-number"
            className={`${HOSTED_FIELDS} px-3`}
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

          {enableVaulting && braintreeCustomerId && (
            <>
              <label className={`${HOSTED_FIELDS_LABEL} mb-2`}>
                <input className="mr-3" ref={ccVaultCheckbox} type="checkbox" />
                Save my card
              </label>
            </>
          )}

          <div className="block text-center">
            {selectedCard === "new" && (
              <input
                disabled={emptyInputs && invalidInput}
                type="submit"
                className={renderMaskButtonClasses(
                  fullWidth,
                  !(emptyInputs && invalidInput),
                  emptyInputs || invalidInput
                )}
                value={buttonText}
                id="submit"
              />
            )}
          </div>
        </form>
      </div>
      {selectedCard && selectedCard !== "new" && (
        <div className="m-auto p-8 max-w-screen-md">
          <button
            onClick={submitVaultedCard}
            className={renderMaskButtonClasses(fullWidth, true, false)}
          >
            {buttonText}
          </button>
        </div>
      )}
    </>
  );
};
