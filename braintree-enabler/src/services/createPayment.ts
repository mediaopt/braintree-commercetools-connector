import { makeRequest } from "../api";

import {
  CreatePaymentResponse,
  CartInformation,
  RequestHeader,
} from "../types";

export const createPayment = async (
  requestHeader: RequestHeader,
  url: string,
  merchantAccountId?: string,
) => {
  try {
    console.log(url);
    const result = await makeRequest<CreatePaymentResponse, {}>(
      requestHeader,
      url,
      "POST",
      { merchantAccountId },
    );

    return result;
  } catch (error) {
    console.warn(error);
    return false;
  }
};
