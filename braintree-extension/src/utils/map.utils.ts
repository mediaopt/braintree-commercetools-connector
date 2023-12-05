import { TransactionStatus, CustomerCreateRequest } from 'braintree';
import {
  Customer,
  TransactionState,
  TransactionType,
} from '@commercetools/platform-sdk';
import { TypedMoney } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/common';

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
  return Math.round(parseFloat(amount) * Math.pow(10, fractionDigits ?? 0));
};

export const mapCommercetoolsMoneyToBraintreeMoney = (
  amountPlanned: TypedMoney
): string => {
  return (
    amountPlanned.centAmount * Math.pow(10, -amountPlanned.fractionDigits || 0)
  ).toFixed(amountPlanned.fractionDigits || 0);
};

export const mapCommercetoolsCustomerToBraintreeCustomerCreateRequest = (
  customer: Customer,
  createRequest: string
): CustomerCreateRequest => {
  const request = JSON.parse(createRequest);
  return Object.assign(
    {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      company: customer.companyName,
    },
    request
  ) as CustomerCreateRequest;
};
