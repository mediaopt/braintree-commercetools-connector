import { makeRequest } from "../api";

import { BuilderType, CreatePaymentResponse, RequestHeader } from "../types";
import { BraintreePaymentMethodType } from "../components/Builder/types";

export const createPayment = async (
  requestHeader: RequestHeader,
  url: string,
  paymentMethodType: BraintreePaymentMethodType,
  builderType: BuilderType,
  merchantAccountId?: string,
) => {
  try {
    const result = await makeRequest<CreatePaymentResponse, {}>(
      requestHeader,
      url,
      "POST",
      { builderType, paymentMethodType, merchantAccountId },
    );

    return result;
  } catch (error) {
    console.warn(error);
    return false;
  }
};
