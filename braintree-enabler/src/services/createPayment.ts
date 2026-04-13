import { makeRequest } from "../api";

import { CreatePaymentResponse, RequestHeader } from "../types";
import { BraintreePaymentMethodType } from "../components/Builder/types";

export const createPayment = async (
  requestHeader: RequestHeader,
  url: string,
  paymentMethodType: BraintreePaymentMethodType,
  merchantAccountId?: string,
) => {
  try {
    const result = await makeRequest<CreatePaymentResponse, {}>(
      requestHeader,
      url,
      "POST",
      { paymentMethodType, merchantAccountId },
    );

    return result;
  } catch (error) {
    console.warn(error);
    return false;
  }
};
