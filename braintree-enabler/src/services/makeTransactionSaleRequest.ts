import { makeRequest } from "../api";

import { RequestHeader } from "../types";

export const makeTransactionSaleRequest = async (
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
    console.warn(error);
    return false;
  }
};
