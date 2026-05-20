import { ConfigResponseSchemaDTO } from '../../dtos/operations/config.dto';
import { StatusResponseSchemaDTO } from '../../dtos/operations/status.dto';
import { PaymentIntentRequestSchemaDTO } from '../../dtos/operations/payment-intents.dto';
import { Money, Payment } from '@commercetools/connect-payments-sdk';

export type ModifyPaymentWithTransactionRequest = {
  amount: Money;
  payment: Payment;
  transactionId?: string;
};

export type CancelPaymentRequest = {
  payment: Payment;
};

export type ConfigResponse = ConfigResponseSchemaDTO;

export type StatusResponse = StatusResponseSchemaDTO;

export type ModifyPayment = {
  paymentId: string;
  data: PaymentIntentRequestSchemaDTO;
};
