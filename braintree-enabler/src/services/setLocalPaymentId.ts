import { makeRequest } from "../api";

import { RequestHeader } from "../types";

export const setLocalPaymentIdRequest = async (
  requestHeader: RequestHeader,
  url: string,
  paymentId: string,
  paymentVersion: number,
  localPaymentId: string
) => {
  try {
    const data = {
      paymentId,
      paymentVersion,
      localPaymentId,
    };

    const result = await makeRequest(requestHeader, url, "POST", data);

    return result;
  } catch (error) {
    return false;
  }
};
