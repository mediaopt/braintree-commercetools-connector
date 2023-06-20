import { Payment, Transaction } from '@commercetools/platform-sdk';
import { UpdateAction } from '@commercetools/sdk-client-v2';

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
