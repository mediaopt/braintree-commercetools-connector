import {
  useEffect,
  useMemo,
  useState,
  FC,
  PropsWithChildren,
  FormEvent,
  useRef,
} from "react";
import {
  client as braintreeClient,
  dataCollector,
  usBankAccount,
  BraintreeError,
} from "braintree-web";
import { usePayment } from "../../app/usePayment";
import { useNotifications } from "../../app/useNotifications";
import { useLoader } from "../../app/useLoader";

import {
  GeneralPayButtonProps,
  GeneralACHProps,
  GenericError,
} from "../../types";

import { HOSTED_FIELDS_LABEL, HOSTED_FIELDS } from "../../styles";

import { processorRequest } from "../../services/processorRequest";
import { processorUrls } from "../constants";
import { withBraintreeRef } from "../../helpers/braintreeErrorRef";

type AchVaultRequest = {
  paymentMethodNonce: string;
  ctPaymentId: string;
  braintreeCustomerId?: string; // links ACH to customer vault (enables getStoredPaymentMethods)
  ctCustomerId?: string; // required when no Braintree customer exists yet
  logFrontendIssue?: string; // browser-only failure of the previous attempt, logged by the processor
};

type AchVaultResponse = {
  status: boolean;
  token?: string;
  message?: string;
  verified?: boolean;
  merchantReturnUrl?: string; // set by processor when verified=false; used to redirect immediately
};

type AccountType = "" | "checking" | "savings";
type OwnershipType = "" | "personal" | "business";
type BankDetails = {
  accountNumber: string;
  routingNumber: string;
  accountType: AccountType;
  ownershipType: OwnershipType;
  billingAddress: {
    streetAddress: string;
    extendedAddress: string;
    locality: string;
    region: string;
    postalCode: string;
  };
  firstName?: string;
  lastName?: string;
  businessName?: string;
};

type ACHMaskProps = GeneralPayButtonProps & GeneralACHProps;

export const ACHMask: FC<PropsWithChildren<ACHMaskProps>> = ({
  processorUrl,
  mandateText: mandateTextOverride,
  merchantBusinessName,
  actionLabel,
  useKount,
  shipping,
  onRegisterSubmit,
  onRegisterValidation,
  onError,
}: ACHMaskProps) => {
  const {
    handleTransactionSale,
    clientToken,
    requestHeader,
    paymentInfo,
    braintreeCustomerId,
  } = usePayment();
  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const [accountNumber, setAccountNumber] = useState<string>("");
  const [routingNumber, setRoutingNumber] = useState<string>("");
  const [accountType, setAccountType] = useState<AccountType>("");
  const [ownershipType, setOwnershipType] = useState<OwnershipType>("");
  const [businessName, setBusinessName] = useState<string>("");

  // useRef, not useState: read inside the tokenize callback below, which is scheduled
  // synchronously alongside dataCollector.create() in the same submitPayment call — a state
  // closure there would still see the value from before this submission's collector resolved.
  const deviceDataRef = useRef("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [streetAddress, setStreetAddress] = useState<string>("");
  const [extendedAddress, setExtendedAddress] = useState<string>("");
  const [locality, setLocality] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [postalCode, setPostalCode] = useState<string>("");
  const { getAchVaultTokenURL } = processorUrls(processorUrl);

  useEffect(() => {
    const { firstName, lastName, streetName, streetNumber, postalCode } =
      paymentInfo;
    setFirstName(firstName ?? "");
    setLastName(lastName ?? "");
    setStreetAddress(`${streetName ?? ""} ${streetNumber ?? ""}`.trim());
    setPostalCode(postalCode ?? "");
  }, [paymentInfo]);

  const mandateText = useMemo(() => {
    if (mandateTextOverride) return mandateTextOverride;

    const accountHolderName =
      ownershipType === "business" ? businessName : `${firstName} ${lastName}`;
    const formattedAmount = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: paymentInfo.currency,
    }).format(paymentInfo.braintreeAmount);
    const authorizationDate = new Date().toLocaleDateString();

    // No fallback placeholder — if the merchant hasn't configured ach.businessName, the
    // "on behalf of X" clause is dropped entirely rather than showing a placeholder string.
    // A processor-side warning (config()) is the only signal for this, not client-side text.
    const onBehalfOfClause = merchantBusinessName
      ? `Braintree, a service of PayPal, on behalf of ${merchantBusinessName},`
      : `Braintree, a service of PayPal,`;
    const initiateClause = merchantBusinessName
      ? `I authorize ${merchantBusinessName} to initiate`
      : `I authorize`;

    return (
      `By clicking ["${actionLabel}"], I authorize ${onBehalfOfClause} ` +
      `to verify my bank account information using bank information and consumer reports and ${initiateClause} ` +
      `a one-time ACH/electronic debit to my account as follows: ` +
      `Account holder: ${accountHolderName}, Account Number: ${accountNumber}, Routing Number: ${routingNumber}, ` +
      `Amount: ${formattedAmount}, Authorization Date: ${authorizationDate}.`
    );
  }, [
    mandateTextOverride,
    merchantBusinessName,
    actionLabel,
    ownershipType,
    businessName,
    firstName,
    lastName,
    accountNumber,
    routingNumber,
    paymentInfo.braintreeAmount,
    paymentInfo.currency,
  ]);

  let formButtonDisabled =
    !accountNumber ||
    !routingNumber ||
    !accountType ||
    !ownershipType ||
    !streetAddress ||
    !locality ||
    !/^[A-Za-z]{2}$/.test(region) ||
    !postalCode;

  if (ownershipType === "business") {
    formButtonDisabled = formButtonDisabled || !businessName;
  } else {
    formButtonDisabled = formButtonDisabled || !firstName || !lastName;
  }

  const formRef = useRef<HTMLFormElement>(null);
  const formButtonDisabledRef = useRef(false);
  const pendingFrontendIssueRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    formButtonDisabledRef.current = formButtonDisabled;
  }, [formButtonDisabled]);

  // Resolves only once the whole tokenize + vault + transactionSale flow is done and rejects on
  // every failure: Checkout only has submit()'s promise to tell a failed payment apart from a
  // successful one, otherwise it keeps its loader up forever.
  const submitPayment = (): Promise<void> =>
    new Promise((resolve, reject) => {
      // Our own code and text, plus the Braintree reference at most (see withBraintreeRef). The rejection
      // is a fresh Error too: Checkout gets the same sanitized text, never the raw error.
      const report = (code: string, text: string, err?: unknown): Error => {
        const error: GenericError = {
          code,
          message: withBraintreeRef(text, err),
        };
        console.error(`ACH payment failed: ${error.code} — ${error.message}`);
        onError?.(error);
        return Object.assign(new Error(error.message), { code });
      };

      const fail = (code: string, text: string, err?: unknown) => {
        notify("Error", text);
        isLoading(false);
        reject(report(code, text, err));
      };

      // For failures no processor call sees: the next attempt's vault request carries them, since the
      // buyer's browser console usually isn't accessible to whoever debugs the payment.
      const failInBrowser: typeof fail = (code, text, err) => {
        pendingFrontendIssueRef.current = `${code}: ${withBraintreeRef(text, err)}`;
        fail(code, text, err);
      };

      if (!clientToken) {
        return fail("ACH_NO_CLIENT_TOKEN", "Something went wrong - try again");
      }

      if (formButtonDisabled) {
        notify("Error", "Please fill in all required fields");
        return reject(new Error("empty fields"));
      }
      isLoading(true);

      const mandateAcceptedAt = new Date().toISOString();

      let bankDetails: BankDetails = {
        accountNumber,
        routingNumber,
        accountType,
        ownershipType,
        billingAddress: {
          streetAddress,
          extendedAddress,
          locality,
          region,
          postalCode,
        },
      };

      if (ownershipType === "personal") {
        bankDetails.firstName = firstName;
        bankDetails.lastName = lastName;
      } else {
        bankDetails.businessName = businessName;
      }

      braintreeClient.create(
        {
          authorization: clientToken,
        },
        function (clientErr, clientInstance) {
          if (clientErr) {
            return failInBrowser(
              "ACH_CLIENT_CREATE_FAILED",
              "There was an error connecting to Braintree.",
              clientErr,
            );
          }

          usBankAccount.create(
            {
              client: clientInstance,
            },
            function (usBankAccountErr, usBankAccountInstance) {
              if (usBankAccountErr || !usBankAccountInstance) {
                return failInBrowser(
                  "ACH_US_BANK_ACCOUNT_CREATE_FAILED",
                  "There was an error creating the USBankAccount instance.",
                  usBankAccountErr,
                );
              }

              dataCollector.create(
                {
                  client: clientInstance,
                  paypal: true,
                  kount: useKount ?? undefined,
                },
                function (dataCollectorErr, dataCollectorInstance) {
                  // Non-blocking: the sale goes through without fraud device data (often blocked by
                  // ad blockers), and the processor warns about the missing deviceData itself.
                  if (dataCollectorErr) {
                    console.warn(
                      withBraintreeRef(
                        "ACH fraud device data collection failed.",
                        dataCollectorErr,
                      ),
                    );
                    return;
                  }
                  if (dataCollectorInstance) {
                    deviceDataRef.current = dataCollectorInstance.deviceData;
                  }
                },
              );

              usBankAccountInstance.tokenize(
                {
                  bankDetails: bankDetails,
                  mandateText: mandateText,
                  bankLogin: undefined,
                },
                async function (
                  tokenizeErr?: BraintreeError,
                  tokenizedPayload?: any,
                ) {
                  // Without this, anything thrown here would leave submitPayment unsettled and the
                  // loader up forever.
                  let vaultRequested = false;
                  try {
                    if (tokenizeErr) {
                      return failInBrowser(
                        "ACH_TOKENIZE_FAILED",
                        "There was an error tokenizing the bank details.",
                        tokenizeErr,
                      );
                    }
                    if (!tokenizedPayload?.nonce) {
                      return failInBrowser(
                        "ACH_TOKENIZE_NO_NONCE",
                        "There was an error tokenizing the bank details.",
                      );
                    }

                    vaultRequested = true;
                    const vaultResponse = await processorRequest<
                      AchVaultRequest,
                      AchVaultResponse
                    >(requestHeader, getAchVaultTokenURL, {
                      paymentMethodNonce: tokenizedPayload.nonce,
                      ctPaymentId: paymentInfo.ctPaymentId,
                      braintreeCustomerId: braintreeCustomerId || undefined,
                      ctCustomerId: paymentInfo.ctCustomerId,
                      logFrontendIssue: pendingFrontendIssueRef.current,
                    });

                    if (!vaultResponse) {
                      // No response when the processor is unreachable or answers non-JSON; the
                      // pending issue stays for the next attempt.
                      return fail(
                        "ACH_VAULT_REQUEST_FAILED",
                        "There is an error in vaulting the bank account.",
                      );
                    }
                    pendingFrontendIssueRef.current = undefined;

                    const {
                      token: vaultToken,
                      verified,
                      merchantReturnUrl,
                    } = vaultResponse;

                    // The processor's message is not passed on (see withBraintreeRef); the processor
                    // logs the failure itself.
                    if (!vaultToken) {
                      return fail(
                        "ACH_VAULT_FAILED",
                        "There is an error in vaulting the bank account.",
                      );
                    }

                    if (verified) {
                      // Instantly verified (bank login / Plaid): proceed with payment immediately.
                      try {
                        await handleTransactionSale("", {
                          paymentToken: vaultToken,
                          deviceData: deviceDataRef.current,
                          lineItems: paymentInfo.braintreeLineItems,
                          shipping,
                          achMandateText: mandateText,
                          achMandateAcceptedAt: mandateAcceptedAt,
                        });
                        resolve();
                      } catch {
                        // handleTransactionSale already shows the toast; the processor logs the failure.
                        reject(
                          report(
                            "ACH_TRANSACTION_SALE_FAILED",
                            "The payment could not be completed.",
                          ),
                        );
                      } finally {
                        isLoading(false);
                      }
                    } else {
                      // Micro-deposit verification initiated: CT payment already synced to Pending
                      // by the processor. Redirect to result page — merchant is responsible for
                      // completing payment once the customer verifies their bank account.
                      isLoading(false);
                      if (merchantReturnUrl) {
                        window.location.href = merchantReturnUrl;
                      } else {
                        console.warn(
                          "ACH micro-deposit verification started but no merchantReturnUrl was returned — check MERCHANT_RETURN_URL",
                        );
                        notify("Info", mandateText);
                      }
                      resolve();
                    }
                  } catch (err) {
                    (vaultRequested ? fail : failInBrowser)(
                      "ACH_UNEXPECTED_ERROR",
                      "Something went wrong - try again",
                      err,
                    );
                  }
                },
              );
            },
          );
        },
      );
    });

  // Checkout's submit is registered once (effect below), so it calls the latest submitPayment
  // through this ref instead of capturing the form state of its first render.
  const submitPaymentRef = useRef(submitPayment);
  submitPaymentRef.current = submitPayment;

  useEffect(() => {
    if (!clientToken) return;
    onRegisterSubmit?.(() => submitPaymentRef.current());
    onRegisterValidation?.({
      isValid: async () => !formButtonDisabledRef.current,
      showValidation: async () => {
        formRef.current?.reportValidity();
      },
    });
  }, [clientToken]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Failures are already notified inside submitPayment.
    submitPayment().catch(() => {});
  };

  return (
    <>
      <form
        className="m-auto p-8 max-w-3xl"
        ref={formRef}
        onSubmit={handleSubmit}
      >
        <label className={HOSTED_FIELDS_LABEL} htmlFor="routing-number">
          Routing Number
        </label>
        <input
          type="text"
          id="routing-number"
          className={`${HOSTED_FIELDS} px-3`}
          value={routingNumber}
          onChange={({ target }) => setRoutingNumber(target.value)}
          required
        />

        <label className={HOSTED_FIELDS_LABEL} htmlFor="account-number">
          Account Number
        </label>
        <input
          type="text"
          id="account-number"
          className={`${HOSTED_FIELDS} px-3`}
          value={accountNumber}
          onChange={({ target }) => setAccountNumber(target.value)}
          required
        />

        <label className={HOSTED_FIELDS_LABEL} htmlFor="account-type">
          Account Type
        </label>
        <select
          id="account-type"
          className={`${HOSTED_FIELDS} px-3`}
          value={accountType}
          onChange={({ target }) => setAccountType(target.value as AccountType)}
          required
        >
          <option value="">Select</option>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
        </select>

        <label className={HOSTED_FIELDS_LABEL} htmlFor="ownership-number">
          Ownership Type
        </label>
        <select
          id="ownership-type"
          className={`${HOSTED_FIELDS} px-3`}
          value={ownershipType}
          onChange={({ target }) =>
            setOwnershipType(target.value as OwnershipType)
          }
          required
        >
          <option value="">Select</option>
          <option value="personal">Personal</option>
          <option value="business">Business</option>
        </select>

        {ownershipType === "business" && (
          <>
            <label className={HOSTED_FIELDS_LABEL} htmlFor="business-name">
              Business Name
            </label>
            <input
              type="text"
              id="business-name"
              className={`${HOSTED_FIELDS} px-3`}
              value={businessName}
              onChange={({ target }) => setBusinessName(target.value)}
              required
            />
          </>
        )}

        {ownershipType === "personal" && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={HOSTED_FIELDS_LABEL} htmlFor="first-name">
                First Name
              </label>
              <input
                type="text"
                id="first-name"
                className={`${HOSTED_FIELDS} px-3`}
                value={firstName}
                onChange={({ target }) => setFirstName(target.value)}
                required
              />
            </div>
            <div className="flex-1">
              <label className={HOSTED_FIELDS_LABEL} htmlFor="last-name">
                Last Name
              </label>
              <input
                type="text"
                id="last-name"
                className={`${HOSTED_FIELDS} px-3`}
                value={lastName}
                onChange={({ target }) => setLastName(target.value)}
                required
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={HOSTED_FIELDS_LABEL} htmlFor="street-address">
              Street Address
            </label>
            <input
              type="text"
              id="street-address"
              className={`${HOSTED_FIELDS} px-3`}
              value={streetAddress}
              onChange={({ target }) => setStreetAddress(target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <label className={HOSTED_FIELDS_LABEL} htmlFor="extended-address">
              Extended Address
            </label>
            <input
              type="text"
              id="extended-address"
              className={`${HOSTED_FIELDS} px-3`}
              value={extendedAddress}
              onChange={({ target }) => setExtendedAddress(target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={HOSTED_FIELDS_LABEL} htmlFor="locality">
              Locality
            </label>
            <input
              type="text"
              id="locality"
              className={`${HOSTED_FIELDS} px-3`}
              value={locality}
              onChange={({ target }) => setLocality(target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <label className={HOSTED_FIELDS_LABEL} htmlFor="region">
              Region
            </label>
            <input
              type="text"
              id="region"
              className={`${HOSTED_FIELDS} px-3`}
              value={region}
              onChange={({ target }) => setRegion(target.value)}
              required
              placeholder="NY"
              pattern="[A-Za-z]{2}"
              maxLength={2}
            />
          </div>
        </div>

        <label className={HOSTED_FIELDS_LABEL} htmlFor="postal-code">
          Postal Code
        </label>
        <input
          type="text"
          id="postal-code"
          className={`${HOSTED_FIELDS} px-3`}
          value={postalCode}
          onChange={({ target }) => setPostalCode(target.value)}
          required
        />

        <p className="mt-4 text-sm text-gray-500">{mandateText}</p>
      </form>
    </>
  );
};
