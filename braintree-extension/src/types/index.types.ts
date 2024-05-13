import { Payment, Transaction } from '@commercetools/platform-sdk';
import { UpdateAction } from '@commercetools/sdk-client-v2';
import {
  Customer,
  PaymentMethod,
  PaymentMethodCreateRequest as BraintreePaymentMethodCreateRequest,
  PaymentInstrumentType as BraintreePaymentInstrumentType,
  Transaction as BraintreeTransaction,
  TransactionLineItem,
} from 'braintree';

export type Message = {
  code: string;
  message: string;
  referencedBy: string;
};

export type ValidatorCreator = (
  path: string[],
  message: Message,
  overrideConfig?: object
) => [string[], [[(o: object) => boolean, string, [object]]]];

export type ValidatorFunction = (o: object) => boolean;

export type Wrapper = (
  validator: ValidatorFunction
) => (value: object) => boolean;

export type PaymentWithOptionalTransaction = {
  payment: Payment;
  transaction?: Transaction;
};

export type UpdateActions = Array<UpdateAction>;

export type CustomerResponse = PaymentMethod | Customer;

export type PaymentMethodCreateRequest = BraintreePaymentMethodCreateRequest & {
  options: {
    usBankAccountVerificationMethod:
      | 'independent_check'
      | 'micro_transfers'
      | 'network_check'
      | 'tokenized_check';
  };
};

export type PaymentInstrumentType =
  | BraintreePaymentInstrumentType
  | 'local_payment';

export type LocalPayment = {
  fundingSource: string;
  payerId: string;
  paymentId: string;
  transactionFeeAmount: string;
  transactionFeeCurrencyIsoCode: string;
  captureId: string;
  debugId: string;
};

export type LocalPaymentTransaction = BraintreeTransaction & {
  localPayment: LocalPayment;
};

export type Package = {
  carrier: string;
  trackingNumber: string;
  notifyPayer?: boolean;
  items?: LineItem[];
};

type LineItem = TransactionLineItem & {
  upc_code?: string;
  upc_type?: string;
  image_url?: string;
};
