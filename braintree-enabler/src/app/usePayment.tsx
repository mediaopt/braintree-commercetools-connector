import { FC, createContext, useMemo, useContext, useState } from "react";
import {
  FetchPaymentMethodsPayload,
  VaultManager,
  vaultManager,
} from "braintree-web";
import { getClientToken, createPayment } from "../services";
import { Result } from "../components/Result";

import {
  GeneralComponentsProps,
  ClientTokenResponse,
  CreatePaymentResponse,
  PaymentInfo,
  CartInformationInitial,
  TransactionSaleResponse,
  RequestHeader,
} from "../types";
import { makeTransactionSaleRequest } from "../services/makeTransactionSaleRequest";
import { useNotifications } from "./useNotifications";
import { useLoader } from "./useLoader";
import { setLocalPaymentIdRequest } from "../services/setLocalPaymentId";
import { makeVaultRequest } from "../services/makeVaultRequest";

type HandlePurchaseType = (
  paymentNonce: string,
  options?: { [index: string]: any },
  overridePaymentVersion?: number
) => void;

type PaymentContextT = {
  gettingClientToken: boolean;
  clientToken: string;
  handleGetClientToken: (
    merchantAccountId?: string,
    vaultPayment?: boolean
  ) => void;
  setLocalPaymentId: (
    localPaymentId: string,
    saveLocalPaymentUrl: string
  ) => Promise<number>;
  handlePurchase: HandlePurchaseType;
  handlePureVault: (paymentNonce: string) => void;
  paymentInfo: PaymentInfo;
  vaultedPaymentMethods: FetchPaymentMethodsPayload[];
  handleGetVaultedPaymentMethods: () => Promise<FetchPaymentMethodsPayload[]>;
  braintreeCustomerId: string;
  requestHeader: RequestHeader;
};

const PaymentInfoInitialObject = {
  version: 0,
  id: "",
  amount: 0,
  currency: "",
  lineItems: [],
  shippingMethod: {},
  cartInformation: CartInformationInitial,
};

const PaymentContext = createContext<PaymentContextT>({
  gettingClientToken: false,
  clientToken: "",
  handleGetClientToken: () => {},
  setLocalPaymentId: () => new Promise<number>(() => 0),
  handlePurchase: () => {},
  handlePureVault: () => {},
  paymentInfo: PaymentInfoInitialObject,
  vaultedPaymentMethods: [],
  handleGetVaultedPaymentMethods: () =>
    new Promise<FetchPaymentMethodsPayload[]>(
      (resolve) => [] as FetchPaymentMethodsPayload[]
    ),
  braintreeCustomerId: "",
  requestHeader: {},
});

export const PaymentProvider: FC<
  React.PropsWithChildren<GeneralComponentsProps>
> = ({
  createPaymentUrl,
  createPaymentForVault,
  getClientTokenUrl,
  purchaseUrl,
  vaultPaymentMethodUrl,
  purchaseCallback,
  children,
  cartInformation,
  taxAmount,
  shippingAmount,
  discountAmount,
  shippingMethodId,
  requestHeader,
}) => {
  const [gettingClientToken, setGettingClientToken] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState<boolean>();
  const [resultMessage, setResultMessage] = useState<string>();

  const [clientToken, setClientToken] = useState("");
  const [braintreeCustomerId, setBraintreeCustomerId] = useState("");
  const [customerVersion, setCustomerVersion] = useState<number>();
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>(
    PaymentInfoInitialObject
  );
  const [vaultedPaymentMethods, setVaultedPaymentMethods] = useState<
    FetchPaymentMethodsPayload[]
  >([]);

  const { notify } = useNotifications();
  const { isLoading } = useLoader();

  const value = useMemo(() => {
    const handleGetClientToken = async (
      merchantAccountId?: string,
      vaultPayment?: boolean
    ) => {
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
          cartInformation,
          shippingMethodId
        )) as CreatePaymentResponse;

        if (!createPaymentResult.braintreeCustomerId && vaultPayment) {
          isLoading(false);
          setGettingClientToken(false);
          notify("Error", "User not found");
          return;
        }

        setCustomerVersion(createPaymentResult.customerVersion);
        setBraintreeCustomerId(createPaymentResult.braintreeCustomerId);
        if (
          createPaymentResult &&
          createPaymentResult.id &&
          createPaymentResult.version
        ) {
          const clientTokenresult = (await getClientToken(
            requestHeader,
            getClientTokenUrl,
            createPaymentResult.id,
            createPaymentResult.version,
            createPaymentResult.braintreeCustomerId,
            merchantAccountId
          )) as ClientTokenResponse;

          if (!clientTokenresult) {
            isLoading(false);
            setGettingClientToken(false);
            notify("Error", "There is an error in getting client token!");
            return;
          }

          const { amountPlanned, lineItems, shippingMethod } =
            createPaymentResult;

          setPaymentInfo({
            id: createPaymentResult.id,
            version: clientTokenresult.paymentVersion,
            amount: amountPlanned.centAmount / 100,
            currency: amountPlanned.currencyCode,
            lineItems: lineItems,
            shippingMethod: shippingMethod,
            cartInformation: cartInformation,
          });

          if (clientTokenresult.clientToken) {
            setClientToken(clientTokenresult.clientToken);
            setGettingClientToken(false);
            isLoading(false);
            return;
          }
        }

        notify("Error", "There is an error in getting client token!");
      } catch (error) {
        notify("Error", "Authentication Error!");
        console.error(error);
      }
      setGettingClientToken(false);
      isLoading(false);
    };

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
              customerPaymentMethods: FetchPaymentMethodsPayload[] | undefined
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
            }
          );
        },
        () => {
          return vaultedPaymentMethods;
        }
      );
    };

    const setLocalPaymentId = async (
      localPaymentId: string,
      saveLocalPaymentUrl: string
    ) => {
      const response = (await setLocalPaymentIdRequest(
        requestHeader,
        saveLocalPaymentUrl,
        paymentInfo.id,
        paymentInfo.version,
        localPaymentId
      )) as { paymentVersion: number };

      setPaymentInfo({ ...paymentInfo, version: response.paymentVersion });

      return response.paymentVersion;
    };

    const handlePurchase: HandlePurchaseType = async (
      paymentNonce,
      options?,
      overridePaymentVersion?
    ) => {
      const additional = options ?? {};

      if (taxAmount) {
        additional.taxAmount = taxAmount;
      }

      if (shippingAmount) {
        additional.shippingAmount = shippingAmount;
      }

      if (discountAmount) {
        additional.discountAmount = discountAmount;
      }

      const requestBody = {
        paymentVersion: overridePaymentVersion || paymentInfo.version,
        paymentId: paymentInfo.id,
        paymentMethodNonce: paymentNonce,
        ...additional,
      };

      isLoading(true);
      const response = (await makeTransactionSaleRequest(
        requestHeader,
        purchaseUrl,
        requestBody
      )) as TransactionSaleResponse;
      isLoading(false);
      if (response.ok === false || !response) {
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
        requestBody
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
      gettingClientToken,
      clientToken,
      handleGetClientToken,
      setLocalPaymentId,
      handlePurchase,
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
      ) : (
        children
      )}
    </PaymentContext.Provider>
  );
};

export const usePayment = () => useContext(PaymentContext);
