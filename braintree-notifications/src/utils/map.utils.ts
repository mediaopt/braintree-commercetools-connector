import { TransactionStatus } from 'braintree';
import { TransactionState } from '@commercetools/platform-sdk';

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
