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
  GeneralComponentsProps,
  CreatePaymentResponse,
  PaymentInfo,
  TransactionSaleResponse,
  RequestHeader,
} from "../types";
import { makeTransactionSaleRequest } from "../services/makeTransactionSaleRequest";
import { useNotifications } from "./useNotifications";
import { useLoader } from "./useLoader";
import { setLocalPaymentIdRequest } from "../services/setLocalPaymentId";
import { makeVaultRequest } from "../services/makeVaultRequest";
import { processorUrls } from "../components/constants";
import { sessionHeader } from "../helpers/sessionHeader";
import { LoadingOverlay } from "../components/LoadingOverlay";

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
  braintreeCustomerId: "",
  requestHeader: {},
});

export const PaymentProvider: FC<PropsWithChildren<GeneralComponentsProps>> = ({
  processorUrl,
  sessionId,
  merchantAccountId,
  purchaseCallback,
  children,
}) => {
  const [gettingClientToken, setGettingClientToken] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState<boolean>();
  const [resultMessage, setResultMessage] = useState<string>();

  const [clientToken, setClientToken] = useState<string>();
  const [braintreeCustomerId, setBraintreeCustomerId] = useState("");
  const [customerVersion, setCustomerVersion] = useState<number>();
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>(
    PaymentInfoInitialObject,
  );

  const [vaultedPaymentMethods, setVaultedPaymentMethods] = useState<
    FetchPaymentMethodsPayload[]
  >([]);
  const {
    createPaymentUrl,
    transactionSaleUrl,
    createPaymentForVault,
    vaultPaymentMethodUrl,
  } = processorUrls(processorUrl);
  const requestHeader = sessionHeader(sessionId);

  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  useEffect(() => {
    const handleInitPayment = async (vaultPayment?: boolean) => {
      setGettingClientToken(true);
      isLoading(true);
      try {
        const createPaymentEndpoint =
          vaultPayment && createPaymentForVault
            ? createPaymentForVault
            : createPaymentUrl;
        const createPaymentResult = (await createPayment(
          requestHeader,
          createPaymentEndpoint,
          merchantAccountId, //todo - check if merchant account id is for local payment method only and shouldn't be passed anywhere else
        )) as CreatePaymentResponse;
        setClientToken(createPaymentResult.braintreeData.clientToken);
        setBraintreeCustomerId(
          createPaymentResult.braintreeData.braintreeCustomerId,
        );
        setPaymentInfo(createPaymentResult.payment);
      } catch (error) {
        notify("Error", "Authentication Error!");
        console.error(error);
      }
      setGettingClientToken(false);
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
        customerVersion: customerVersion,
        customerId: braintreeCustomerId,
        paymentMethodNonce: paymentNonce,
      };

      if (!vaultPaymentMethodUrl) return;

      isLoading(true);
      const response = await makeVaultRequest(
        requestHeader,
        vaultPaymentMethodUrl,
        requestBody,
      );
      isLoading(false);
      if (response.ok === false || !response) {
        notify("Error", response.message ?? "An error occurred");
        return;
      }

      setResultMessage("Payment vaulted");

      setShowResult(true);
      if (purchaseCallback) {
        purchaseCallback(response);
      }
    };

    return {
      sessionId,
      gettingClientToken,
      clientToken,
      setLocalPaymentId,
      handleTransactionSale,
      handlePureVault,
      paymentInfo,
      vaultedPaymentMethods,
      handleGetVaultedPaymentMethods,
      braintreeCustomerId,
      requestHeader,
    };
  }, [clientToken, gettingClientToken]);

  return (
    <PaymentContext.Provider value={value}>
      {showResult ? (
        <Result success={resultSuccess} message={resultMessage} />
      ) : clientToken ? (
        children
      ) : (
        <LoadingOverlay />
      )}
    </PaymentContext.Provider>
  );
};

export const usePayment = () => useContext(PaymentContext);
