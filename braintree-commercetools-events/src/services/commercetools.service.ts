import { Order, Payment } from '@commercetools/platform-sdk';
import { createApiRoot } from '../client/create.client';

export const getOrderById = async (
  orderId: string
): Promise<Order | undefined> => {
  if (!orderId) {
    return undefined;
  }
  const apiRoot = createApiRoot();
  const response = await apiRoot
    .orders()
    .withId({ ID: orderId })
    .get()
    .execute();
  return response.body;
};

export const getPaymentById = async (
  paymentId: string
): Promise<Payment | undefined> => {
  if (!paymentId) {
    return undefined;
  }
  const apiRoot = createApiRoot();
  const response = await apiRoot
    .payments()
    .withId({ ID: paymentId })
    .get()
    .execute();
  return response.body;
};
