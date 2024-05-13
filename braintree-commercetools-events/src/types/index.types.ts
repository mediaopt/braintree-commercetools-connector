import { Delivery, OrderReference, Parcel } from '@commercetools/platform-sdk';

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

export type Package = {
  transactionId: string;
  carrier: string;
  trackingNumber: string;
  notifyPayer?: boolean;
  lineItems?: LineItem[];
};

export type LineItem = {
  upc_code?: string;
  upc_type?: string;
  image_url?: string;
  quantity?: number;
  name?: string;
  description?: string;
  productCode?: string;
  url?: string;
};

export type ParcelAddedToDeliveryMessagePayload = {
  notificationType: 'Message';
  projectKey: string;
  id: string;
  version: number;
  sequenceNumber: number;
  resource: OrderReference;
  resourceVersion: number;
  type: 'ParcelAddedToDelivery';
  delivery: Delivery;
  parcel: Parcel;
  createdAt: string;
  lastModifiedAt: string;
};
