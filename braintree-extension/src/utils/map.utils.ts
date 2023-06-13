import { TransactionStatus } from 'braintree';
import { TransactionState, TransactionType } from '@commercetools/platform-sdk';

export const mapBraintreeStatusToCommercetoolsTransactionState = (
  status: TransactionStatus
): TransactionState => {
  switch (status) {
    case 'authorized':
    case 'settled':
    case 'voided':
    case 'settlement_confirmed':
      return 'Success';
    case 'authorization_expired':
    case 'gateway_rejected':
    case 'failed':
    case 'settlement_declined':
    case 'processor_declined':
      return 'Failure';
    default:
      return 'Pending';
  }
};

export const mapBraintreeStatusToCommercetoolsTransactionType = (
  status: TransactionStatus
): TransactionType => {
  switch (status) {
    case 'authorized':
    case 'authorizing':
      return 'Authorization';
    case 'voided':
      return 'CancelAuthorization';
    case 'settled':
    case 'settling':
    case 'settlement_confirmed':
    case 'settlement_pending':
    case 'submitted_for_settlement':
    default:
      return 'Charge';
  }
};

export const mapBraintreeMoneyToCommercetoolsMoney = (
  amount: string,
  fractionDigits: number | undefined
): number => {
  return parseFloat(amount) * Math.pow(10, fractionDigits ?? 0);
};
