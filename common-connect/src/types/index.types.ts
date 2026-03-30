import { TransactionLineItem } from "braintree";

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
