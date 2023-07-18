import { Payment, Transaction } from '@commercetools/platform-sdk';
import { UpdateAction } from '@commercetools/sdk-client-v2';
import {
  Customer,
  PaymentMethod,
  PaymentMethodCreateRequest as BraintreePaymentMethodCreateRequest,
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
