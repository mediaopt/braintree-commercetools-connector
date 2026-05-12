import { TransactionLineItem, PaymentMethod, Customer } from "braintree";
import { UpdateAction } from "@commercetools/sdk-client-v2";
import { Payment, Transaction } from "@commercetools/platform-sdk";
export type UpdateActions = Array<UpdateAction>;

export type CustomerResponse = PaymentMethod | Customer;

type LineItem = TransactionLineItem & {
  upc_code?: string;
  upc_type?: string;
  image_url?: string;
};

export type Package = {
  carrier: string;
  trackingNumber: string;
  notifyPayer?: boolean;
  items?: LineItem[];
};

export type MessageFieldData = {
  messageName: string;
  message: string | object;
  messageType: "Request" | "Response";
};

export type PaymentWithOptionalTransaction = {
  payment: Payment;
  transaction?: Transaction;
};
