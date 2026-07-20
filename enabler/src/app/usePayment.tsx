import {
  FC,
  PropsWithChildren,
  createContext,
  useMemo,
  useContext,
  useState,
  useEffect,
} from "react";
import { processorRequest } from "../services/processorRequest";
import { Result } from "../components/Result";
import {
  CreatePaymentRequest,
  TransactionSaleOptions,
  TransactionSaleRequest,
  // PURE_VAULT_DISABLED  VaultRequest,
  ChangeShippingRequest,
  StoredPaymentMethod,
  StoredPaymentMethodsResponse,
} from "../services/types";

import {
  CreatePaymentResponse,
  ExpressClientTokenResponse,
  PaymentInfo,
  RequestHeader,
  PaymentProviderProps,
} from "../types";
import { useNotifications } from "./useNotifications";
import { useLoader } from "./useLoader";
import { processorUrls } from "../components/constants";
import { sessionHeader } from "../helpers/sessionHeader";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { PayPalCheckoutUpdatePaymentOptions } from "braintree-web/paypal-checkout";

type PaymentActionResponseData = {
  message: string;
  success: boolean;
  paymentReference?: string;
  merchantReturnUrl?: string;
};

type HandleTransactionSaleType = (
  paymentNonce: string,
  options?: TransactionSaleOptions & { ctPaymentIdOverride?: string },
) => Promise<void>;

type DeferredPaymentResult = {
  clientToken: string;
  braintreeCustomerId: string;
  paymentInfo: PaymentInfo;
};

type PaymentContextT = {
  gettingClientToken: boolean;
  clientToken?: string;
  handleTransactionSale: HandleTransactionSaleType;
  // PURE_VAULT_DISABLED handlePureVault: (paymentNonce: string) => Promise<void>;
  createExpressPayment: () => Promise<DeferredPaymentResult>;
  paymentInfo: PaymentInfo;
  vaultedPaymentMethods: StoredPaymentMethod[];
  handleGetVaultedPaymentMethods: () => Promise<StoredPaymentMethod[]>;
  // return shape mirrors UpdateCartShippingResponseSchemaDTO in processor/src/dtos/braintree-payment.dto.ts
  updateCartShipping: (
    newShippingMethodId: string,
    address?: ChangeShippingRequest["address"],
  ) => Promise<{
    braintreeAmount: string;
    amountBreakdown: PayPalCheckoutUpdatePaymentOptions["amountBreakdown"]; //the actually required fields are handled at the processor side
  }>;
  braintreeCustomerId: string;
  requestHeader: RequestHeader;
};

const PaymentInfoInitialObject: PaymentInfo = {
  ctPaymentId: "",
  braintreeAmount: 0,
  currency: "",
};

const PaymentContext = createContext<PaymentContextT>({
  gettingClientToken: false,
  clientToken: undefined,
  handleTransactionSale: () => Promise.resolve(),
  //PURE_VAULT_DISABLED handlePureVault: () => Promise.resolve(),
  createExpressPayment: () =>
    Promise.reject(new Error("createExpressPayment called outside PaymentProvider")),
  paymentInfo: PaymentInfoInitialObject,
  vaultedPaymentMethods: [],
  handleGetVaultedPaymentMethods: () =>
    Promise.resolve([] as StoredPaymentMethod[]),
  updateCartShipping: () =>
    Promise.resolve({
      braintreeAmount: "",
      amountBreakdown: {
        itemTotal: "0.00",
        taxTotal: "0.00",
        shipping: "0.00",
        discount: "0.00",
        handling: "0.00",
        insurance: "0.00",
        shippingDiscount: "0.00",
      },
    }),
  braintreeCustomerId: "",
  requestHeader: {},
});

export const PaymentProvider: FC<PropsWithChildren<PaymentProviderProps>> = ({
  processorUrl,
  sessionId,
  merchantAccountId,
  purchaseCallback,
  paymentMethodType,
  builderType,
  deferredPaymentCreation,
  initialAmount,
  children,
}) => {
  // PURE_VAULT_DISABLED const isPureVault = false;
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState<boolean>();
  const [resultMessage, setResultMessage] = useState<string>();

  const [clientToken, setClientToken] = useState<string>();
  const [braintreeCustomerId, setBraintreeCustomerId] = useState("");
  // In deferred mode, no real payment exists yet — seed just enough (currency/amount) from
  // initialAmount for PayPalMask's SDK bootstrap (loadPayPalSDK) to initialize with.
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>(
    deferredPaymentCreation && initialAmount
      ? {
          ctPaymentId: "",
          braintreeAmount:
            initialAmount.centAmount / 10 ** initialAmount.fractionDigits,
          currency: initialAmount.currencyCode,
        }
      : PaymentInfoInitialObject,
  );

  const [vaultedPaymentMethods, setVaultedPaymentMethods] = useState<
    StoredPaymentMethod[]
  >([]);
  const {
    createPaymentUrl,
    expressClientTokenUrl,
    transactionSaleUrl,
    // PURE_VAULT_DISABLED: pureVaultUrl,
    updateCartShippingUrl,
    getStoredPaymentMethodsURL,
  } = processorUrls(processorUrl);
  const requestHeader = sessionHeader(sessionId);

  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  // Shared by createExpressPayment and handleInitPayment's non-deferred branch below — same
  // request, different result handling (one throws on failure, the other sets state + notifies).
  const fetchCreatePaymentResult = () =>
    processorRequest<CreatePaymentRequest, CreatePaymentResponse>(
      requestHeader,
      createPaymentUrl,
      { builderType, paymentMethodType, merchantAccountId },
    );

  const createExpressPayment = async (): Promise<DeferredPaymentResult> => {
    const result = await fetchCreatePaymentResult();
    if (!result) throw new Error("Could not create express payment");
    return {
      clientToken: result.braintreeData.clientToken,
      braintreeCustomerId: result.braintreeData.braintreeCustomerId,
      paymentInfo: result.payment,
    };
  };

  useEffect(() => {
    const handleInitPayment = async () => {
      setInitializingPayment(true);
      isLoading(true);
      try {
        if (deferredPaymentCreation) {
          // Deferred mode: fetch a Braintree client token only, to render the button — no CT
          // Payment is created here. The real payment is created on click, in createExpressPayment.
          const tokenResult = await processorRequest<
            undefined,
            ExpressClientTokenResponse
          >(requestHeader, expressClientTokenUrl, undefined, "GET");
          if (tokenResult) {
            setClientToken(tokenResult.braintreeData.clientToken);
            setBraintreeCustomerId(
              tokenResult.braintreeData.braintreeCustomerId,
            );
          } else {
            notify("Error", "Could not fetch payment token");
            setClientToken(undefined);
          }
        } else {
          const createPaymentResult = await fetchCreatePaymentResult();
          if (createPaymentResult) {
            setClientToken(createPaymentResult.braintreeData.clientToken);
            setBraintreeCustomerId(
              createPaymentResult.braintreeData.braintreeCustomerId,
            );
            setPaymentInfo(createPaymentResult.payment);
          } else {
            notify("Error", "Could not create payment");
            setClientToken(undefined);
          }
        }
      } catch (error) {
        notify("Error", "Something went wrong.Please try again later!");
        console.error(error);
        setClientToken(undefined);
      } finally {
        setInitializingPayment(false);
        isLoading(false);
      }
    };
    handleInitPayment();
  }, []);

  const value = useMemo(() => {
    // Uses the processor endpoint (server-side gateway.customer.find) instead of the Braintree JS
    // vaultManager.fetchPaymentMethods. The client-side vault manager hits a different Braintree
    // endpoint that does not reliably return all vaulted methods — methods vaulted through certain
    // flows may be invisible to it even though they exist in the vault. The processor's server-side
    // call is authoritative.
    const handleGetVaultedPaymentMethods = async () => {
      if (vaultedPaymentMethods.length)
        return Promise.resolve(vaultedPaymentMethods);
      const result = await processorRequest<
        undefined,
        StoredPaymentMethodsResponse
      >(requestHeader, getStoredPaymentMethodsURL, undefined, "GET");
      const methods = result ? result.storedPaymentMethods : [];
      setVaultedPaymentMethods(methods);
      return methods;
    };

    const handleTransactionSale: HandleTransactionSaleType = async (
      paymentNonce,
      options?,
    ) => {
      const {
        braintreePaymentDetails: incomingDetails,
        ctPaymentIdOverride,
        ...rest
      } = options ?? {};

      const requestBody = {
        // ctPaymentIdOverride is used in the PayPal Express deferred-payment flow, where the real
        // ctPaymentId (from the click-time createExpressPayment result) differs from paymentInfo's,
        // which is either stale (mount-time placeholder) or not the payment this transaction targets.
        ctPaymentId: ctPaymentIdOverride ?? paymentInfo.ctPaymentId,
        paymentMethodNonce: paymentNonce,
        braintreeCustomerId,
        paymentMethodType,
        braintreePaymentDetails: {
          braintreeLineItems:
            incomingDetails?.braintreeLineItems ??
            paymentInfo.braintreeLineItems,
          braintreeShipping:
            incomingDetails?.braintreeShipping ?? paymentInfo.braintreeShipping,
          extraShippingCost: incomingDetails?.extraShippingCost,
        },
        ...rest,
      };

      isLoading(true);
      const response = (await processorRequest<TransactionSaleRequest>(
        requestHeader,
        transactionSaleUrl,
        requestBody,
      )) as PaymentActionResponseData;
      isLoading(false);
      if (!response?.success) {
        notify("Error", response.message ?? "An error occurred");
        return;
      }

      const { message, success, merchantReturnUrl } = response;
      setResultSuccess(success);
      if (merchantReturnUrl) {
        window.location.href = merchantReturnUrl;
      } else {
        setResultMessage(message);
        setShowResult(true);
        if (purchaseCallback && success) {
          delete options?.deviceData;
          purchaseCallback(response, options);
        }
      }
    };

    /* PURE_VAULT_DISABLED start
   const handlePureVault = async (paymentNonce: string) => {
     const requestBody = {
       ctCustomerId: paymentInfo.ctCustomerId,
       ctCustomerVersion: paymentInfo.ctCustomerVersion,
       ctPaymentId: paymentInfo.ctPaymentId,
       braintreeCustomerId,
       paymentMethodNonce: paymentNonce,
     };

     isLoading(true);
     const response = await processorRequest<VaultRequest>(
       requestHeader,
       pureVaultUrl,
       requestBody,
     );
     isLoading(false);
     if (!response?.success) {
       notify("Error", response.message ?? "An error occurred");
       return;
     }

     setResultMessage("Payment vaulted");

     setShowResult(true);
     if (purchaseCallback) {
       purchaseCallback(response);
     }
   };
  PURE_VAULT_DISABLED end */

    const updateCartShipping = async (
      newShippingMethodId: string,
      address?: ChangeShippingRequest["address"],
    ) => {
      return (await processorRequest<ChangeShippingRequest>(
        requestHeader,
        updateCartShippingUrl,
        { newShippingMethodId, address },
        // response shape mirrors UpdateCartShippingResponseSchemaDTO in processor/src/dtos/braintree-payment.dto.ts
      )) as {
        braintreeAmount: string;
        amountBreakdown: PayPalCheckoutUpdatePaymentOptions["amountBreakdown"];
      };
    };

    return {
      sessionId,
      gettingClientToken: initializingPayment,
      clientToken,
      handleTransactionSale,
      // PURE_VAULT_DISABLED handlePureVault,
      createExpressPayment,
      paymentInfo,
      vaultedPaymentMethods,
      handleGetVaultedPaymentMethods,
      updateCartShipping,
      braintreeCustomerId,
      requestHeader,
    };
  }, [clientToken, initializingPayment]);

  return (
    <PaymentContext.Provider value={value}>
      {showResult ? (
        <Result success={resultSuccess} message={resultMessage} />
      ) : clientToken ? (
        children //  PURE_VAULT_DISABLED isPureVault && !paymentInfo.ctCustomerId ? ("You need to log in to save payment method for later") : (children)
      ) : (
        <LoadingOverlay />
      )}
    </PaymentContext.Provider>
  );
};

export const usePayment = () => useContext(PaymentContext);
