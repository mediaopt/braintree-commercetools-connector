import { makeRequest } from "../api";

import { AchVaultRequest, AchVaultResponse, RequestHeader } from "../types";

export const getAchVaultToken = async (
  requestHeader: RequestHeader,
  url: string,
  paymentMethodNonce: string
) => {
  try {
    const data: AchVaultRequest = {
      paymentMethodNonce,
    };

    const result = await makeRequest<AchVaultResponse, AchVaultRequest>(
      requestHeader,
      url,
      "POST",
      data
    );

    return result;
  } catch (error) {
    console.warn(error);
  }
};
