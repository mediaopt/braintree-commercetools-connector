import { makeRequest } from "../api";

import {
  CreatePaymentResponse,
  CartInformation,
  RequestHeader,
} from "../types";

export const createPayment = async (
  requestHeader: RequestHeader,
  url: string,
  cartInformation: CartInformation,
  shippingMethodId?: string
) => {
  try {
    const result = await makeRequest<CreatePaymentResponse, {}>(
      requestHeader,
      url,
      "POST",
      { ...cartInformation, shippingMethodId: shippingMethodId }
    );

    return result;
  } catch (error) {
    console.warn(error);
    return false;
  }
};
