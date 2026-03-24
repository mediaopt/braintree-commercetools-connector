import { makeRequest } from "../api";

import {
  ClientTokenResponse,
  ClientTokenRequest,
  RequestHeader,
} from "../types";

export const getClientToken = async (
  requestHeader: RequestHeader,
  url: string,
  paymentId: string,
  paymentVersion: number,
  braintreeCustomerId?: string,
  merchantAccountId?: string
) => {
  try {
    const data: ClientTokenRequest = {
      paymentId,
      paymentVersion,
      braintreeCustomerId,
      merchantAccountId,
    };

    const result = await makeRequest<ClientTokenResponse, ClientTokenRequest>(
      requestHeader,
      url,
      "POST",
      data
    );

    return result;
  } catch (error) {
    console.warn(error);
    return false;
  }
};
