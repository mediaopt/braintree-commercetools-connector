import {
  Payment,
  TransactionState,
  TransactionType,
  TypedMoney,
} from "@commercetools/platform-sdk";
import { Transaction, TransactionRequest, TransactionStatus } from "braintree";
import { TransactionData } from "@commercetools/connect-payments-sdk";

const CHANNEL_COMMERCETOOLS = "commercetoolsGmbH_SP_BT";

export const mapBraintreeStatusToCommercetoolsTransactionType = (
  status: TransactionStatus,
): TransactionType => {
  switch (status) {
    case "authorized":
    case "authorizing":
      return "Authorization";
    case "voided":
      return "CancelAuthorization";
    case "settled":
    case "settling":
    case "settlement_confirmed":
    case "settlement_pending":
    case "submitted_for_settlement":
    default:
      return "Charge";
  }
};

export const mapBraintreeStatusToCommercetoolsTransactionState = (
  status: TransactionStatus,
): TransactionState => {
  switch (status) {
    case "authorized":
    case "settled":
    case "voided":
    case "settlement_confirmed":
      return "Success";
    case "authorization_expired":
    case "gateway_rejected":
    case "failed":
    case "settlement_declined":
    case "processor_declined":
      return "Failure";
    default:
      return "Pending";
  }
};

export const getPaymentMethodHint = (response: Transaction): string => {
  switch (response.paymentInstrumentType) {
    case "credit_card":
      return `${response?.creditCard?.cardType} ${response?.creditCard?.maskedNumber}`;
    case "paypal_account":
      return response?.paypalAccount?.payerEmail ?? "";
    case "venmo_account":
      return response?.venmoAccount?.username ?? "";
    case "android_pay_card":
      return response?.androidPayCard?.sourceDescription ?? "";
    case "apple_pay_card":
      return response?.applePayCard?.sourceDescription ?? "";
    default:
      return "";
  }
};

export const mapCommercetoolsMoneyToBraintreeMoney = (
  amountPlanned: TypedMoney,
): string => {
  return (
    amountPlanned.centAmount * Math.pow(10, -amountPlanned.fractionDigits || 0)
  ).toFixed(amountPlanned.fractionDigits || 0);
};

export const mapBraintreeMoneyToCommercetoolsMoney = (
  amount: string,
  fractionDigits: number | undefined,
): number => {
  return Math.round(parseFloat(amount) * Math.pow(10, fractionDigits ?? 0));
};

export const mapRequestToBraintreeTransactionSale = (
  payment: Payment,
  storeInVaultOnSuccess = false,
  storeShipping = false,
  paymentMethodNonce?: string,
  paymentMethodToken?: string,
  optionalRequestData?: Partial<TransactionRequest>,
): TransactionRequest => ({
  amount: mapCommercetoolsMoneyToBraintreeMoney(payment.amountPlanned),
  merchantAccountId: process.env.BRAINTREE_MERCHANT_ACCOUNT || undefined,
  channel: CHANNEL_COMMERCETOOLS,
  orderId: payment?.custom?.fields?.BraintreeOrderId ?? undefined,
  options: {
    submitForSettlement: process.env.BRAINTREE_AUTOCAPTURE === "true",
    storeInVaultOnSuccess: storeInVaultOnSuccess,
    storeShippingAddressInVault: storeInVaultOnSuccess && storeShipping,
    paypal: {
      description: process.env.BRAINTREE_PAYPAL_DESCRIPTION ?? undefined,
    },
  },
  ...(optionalRequestData || {}),
  paymentMethodNonce,
  paymentMethodToken,
});

export const mapBraintreeTransactionToCommercetoolsTransaction = (
  payment: Payment,
  response: Transaction,
): TransactionData & { timestamp: string } => {
  const transactionType =
    response.type === "credit"
      ? "Refund"
      : mapBraintreeStatusToCommercetoolsTransactionType(response.status);
  const transaction = payment?.transactions?.find(
    (transaction) =>
      transaction.interactionId === response.id &&
      transaction.type === transactionType,
  );
  return transaction
    ? {
        ...transaction,
        state: mapBraintreeStatusToCommercetoolsTransactionState(
          response.status,
        ),
        timestamp: response.updatedAt,
      }
    : {
        type: transactionType,
        amount: {
          centAmount: mapBraintreeMoneyToCommercetoolsMoney(
            response.amount,
            payment.amountPlanned.fractionDigits,
          ),
          currencyCode: payment.amountPlanned.currencyCode,
        },
        interactionId: response.id,
        timestamp: response.updatedAt,
        state: mapBraintreeStatusToCommercetoolsTransactionState(
          response.status,
        ),
      };
};
