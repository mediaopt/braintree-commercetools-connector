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
import { createPayment } from "../services";
import { Result } from "../components/Result";

import {
  CreatePaymentResponse,
  PaymentInfo,
  TransactionSaleResponse,
  RequestHeader,
  PaymentProviderProps,
} from "../types";
import { makeTransactionSaleRequest } from "../services/makeTransactionSaleRequest";
import { useNotifications } from "./useNotifications";
import { useLoader } from "./useLoader";
import { setLocalPaymentIdRequest } from "../services/setLocalPaymentId";
import { makeVaultRequest } from "../services/makeVaultRequest";
import { processorUrls } from "../components/constants";
import { sessionHeader } from "../helpers/sessionHeader";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { makeChangeShippingRequest } from "../services/makeChangeShippingRequest";

type HandleTransactionSaleType = (
  paymentNonce: string,
  options?: { [index: string]: any },
  overridePaymentVersion?: number,
) => Promise<void>;

type PaymentContextT = {
  gettingClientToken: boolean;
  clientToken?: string;
  setLocalPaymentId: (
    localPaymentId: string,
    saveLocalPaymentUrl: string,
  ) => Promise<number>;
  handleTransactionSale: HandleTransactionSaleType;
  handlePureVault: (paymentNonce: string) => void;
  paymentInfo: PaymentInfo;
  vaultedPaymentMethods: FetchPaymentMethodsPayload[];
  handleGetVaultedPaymentMethods: () => Promise<FetchPaymentMethodsPayload[]>;
  updateCartShipping: (newShippingMethodId: string) => Promise<string>;
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
  setLocalPaymentId: () => new Promise<number>(() => 0),
  handleTransactionSale: () => Promise.resolve(),
  handlePureVault: () => {},
  paymentInfo: PaymentInfoInitialObject,
  vaultedPaymentMethods: [],
  handleGetVaultedPaymentMethods: () =>
    new Promise<FetchPaymentMethodsPayload[]>(
      (resolve) => [] as FetchPaymentMethodsPayload[],
    ),
  updateCartShipping: () => new Promise<string>(() => ""),
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
        const createPaymentResult = (await createPayment(
          requestHeader,
          createPaymentUrl,
          paymentMethodType,
          builderType,
          merchantAccountId,
        )) as CreatePaymentResponse;
        setClientToken(createPaymentResult.braintreeData.clientToken);
        setBraintreeCustomerId(
          createPaymentResult.braintreeData.braintreeCustomerId,
        );
        setPaymentInfo(createPaymentResult.payment);
      } catch (error) {
        notify("Error", "Authentication Error!");
        console.error(error);
        setClientToken(undefined);
      }
      setInitializingPayment(false);
      isLoading(false);
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

    const setLocalPaymentId = async (
      localPaymentId: string,
      saveLocalPaymentUrl: string,
    ) => {
      const response = (await setLocalPaymentIdRequest(
        requestHeader,
        saveLocalPaymentUrl,
        paymentInfo.ctPaymentId,
        localPaymentId,
      )) as { paymentVersion: number };

      setPaymentInfo({ ...paymentInfo });

      return response.paymentVersion;
    };

    const handleTransactionSale: HandleTransactionSaleType = async (
      paymentNonce,
      options?,
    ) => {
      const additional = options ?? {};

      // if (taxAmount) {
      //   additional.taxAmount = taxAmount;
      // }
      //
      // if (shippingAmount) {
      //   additional.shippingAmount = shippingAmount;
      // }
      //
      // if (discountAmount) {
      //   additional.discountAmount = discountAmount;
      // }

      const requestBody = {
        ctPaymentId: paymentInfo.ctPaymentId,
        paymentMethodNonce: paymentNonce,
        ...additional,
      };

      isLoading(true);
      const response = (await makeTransactionSaleRequest(
        requestHeader,
        transactionSaleUrl,
        requestBody,
      )) as TransactionSaleResponse;
      isLoading(false);
      if (!response.ok || !response) {
        notify("Error", response.message ?? "An error occurred");
        return;
      }

      const { message, success } = response.result.transactionSaleResponse;
      setResultSuccess(success);
      setResultMessage(message);

      setShowResult(true);
      if (purchaseCallback && success !== false) {
        delete options?.deviceData;
        purchaseCallback(response, options);
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
      const response = await makeVaultRequest(
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
      const requestBody = {
        newShippingMethodId,
      };
      const response = (await makeChangeShippingRequest(
        requestHeader,
        updateCartShippingUrl,
        requestBody,
      )) as { braintreeAmount: string };
      return response.braintreeAmount;
    };

    return {
      sessionId,
      gettingClientToken: initializingPayment,
      clientToken,
      setLocalPaymentId,
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
