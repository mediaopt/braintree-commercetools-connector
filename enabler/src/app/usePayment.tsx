import {
  FC,
  PropsWithChildren,
  createContext,
  useMemo,
  useContext,
  useState,
  useEffect,
} from "react";
import {
  FetchPaymentMethodsPayload,
  VaultManager,
  vaultManager,
} from "braintree-web";
import { processorRequest } from "../services/processorRequest";
import { Result } from "../components/Result";
import {
  CreatePaymentRequest,
  TransactionSaleOptions,
  TransactionSaleRequest,
  VaultRequest,
  ChangeShippingRequest,
} from "../services/types";

import {
  CreatePaymentResponse,
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
  options?: TransactionSaleOptions,
) => Promise<void>;

type PaymentContextT = {
  gettingClientToken: boolean;
  clientToken?: string;
  handleTransactionSale: HandleTransactionSaleType;
  handlePureVault: (paymentNonce: string) => Promise<void>;
  paymentInfo: PaymentInfo;
  vaultedPaymentMethods: FetchPaymentMethodsPayload[];
  handleGetVaultedPaymentMethods: () => Promise<FetchPaymentMethodsPayload[]>;
  // return shape mirrors UpdateCartShippingResponseSchemaDTO in processor/src/dtos/braintree-payment.dto.ts
  updateCartShipping: (newShippingMethodId: string) => Promise<{
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
  handlePureVault: () => Promise.resolve(),
  paymentInfo: PaymentInfoInitialObject,
  vaultedPaymentMethods: [],
  handleGetVaultedPaymentMethods: () =>
    new Promise<FetchPaymentMethodsPayload[]>(
      (resolve) => [] as FetchPaymentMethodsPayload[],
    ),
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
  children,
}) => {
  const isPureVault = paymentMethodType.endsWith("Vault");
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState<boolean>();
  const [resultMessage, setResultMessage] = useState<string>();

  const [clientToken, setClientToken] = useState<string>();
  const [braintreeCustomerId, setBraintreeCustomerId] = useState("");
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>(
    PaymentInfoInitialObject,
  );

  const [vaultedPaymentMethods, setVaultedPaymentMethods] = useState<
    FetchPaymentMethodsPayload[]
  >([]);
  const {
    createPaymentUrl,
    transactionSaleUrl,
    pureVaultUrl,
    updateCartShippingUrl,
  } = processorUrls(processorUrl);
  const requestHeader = sessionHeader(sessionId);

  const { notify } = useNotifications();
  const { isLoading } = useLoader();
  useEffect(() => {
    const handleInitPayment = async () => {
      setInitializingPayment(true);
      isLoading(true);
      try {
        const createPaymentResult = await processorRequest<
          CreatePaymentRequest,
          CreatePaymentResponse
        >(requestHeader, createPaymentUrl, {
          builderType,
          paymentMethodType,
          merchantAccountId,
        });
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
    const handleGetVaultedPaymentMethods = () => {
      if (!clientToken || vaultedPaymentMethods.length)
        return new Promise<FetchPaymentMethodsPayload[]>(() => {
          return vaultedPaymentMethods;
        });
      isLoading(true);
      return vaultManager.create({ authorization: clientToken }).then(
        (vaultInstance: VaultManager | undefined) => {
          if (vaultInstance === undefined) {
            notify("Info", "No vault manager");
            isLoading(false);
            return vaultedPaymentMethods;
          }
          return vaultInstance.fetchPaymentMethods({ defaultFirst: true }).then(
            (
              customerPaymentMethods: FetchPaymentMethodsPayload[] | undefined,
            ) => {
              isLoading(false);
              if (customerPaymentMethods !== undefined) {
                setVaultedPaymentMethods(customerPaymentMethods);
                return customerPaymentMethods;
              }
              return vaultedPaymentMethods;
            },
            () => {
              return vaultedPaymentMethods;
            },
          );
        },
        () => {
          return vaultedPaymentMethods;
        },
      );
    };

    const handleTransactionSale: HandleTransactionSaleType = async (
      paymentNonce,
      options?,
    ) => {
      const { braintreePaymentDetails: incomingDetails, ...rest } =
        options ?? {};

      const requestBody = {
        ctPaymentId: paymentInfo.ctPaymentId,
        paymentMethodNonce: paymentNonce,
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
          //todo - implement here redirect to return url
          delete options?.deviceData;
          purchaseCallback(response, options);
        }
      }
    };

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

    const updateCartShipping = async (newShippingMethodId: string) => {
      return (await processorRequest<ChangeShippingRequest>(
        requestHeader,
        updateCartShippingUrl,
        { newShippingMethodId },
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
      handlePureVault,
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
        isPureVault && !paymentInfo.ctCustomerId ? (
          "You need to log in to save payment method for later"
        ) : (
          children
        )
      ) : (
        <LoadingOverlay />
      )}
    </PaymentContext.Provider>
  );
};

export const usePayment = () => useContext(PaymentContext);
