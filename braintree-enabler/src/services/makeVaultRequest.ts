import { makeRequest } from "../api";

import { RequestHeader } from "../types";

export const makeVaultRequest = async (
  requestHeader: RequestHeader,
  url: string,
  data: object
) => {
  try {
    const result = await makeRequest<any, any>(
      requestHeader,
      url,
      "POST",
      data
    );

    return result;
  } catch (error) {
    return false;
  }
};
