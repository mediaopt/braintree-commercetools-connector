import { makeRequest } from "../api";
import { RequestHeader } from "../types";

export async function processorRequest<T = undefined, R = any>(
  requestHeader: RequestHeader,
  url: string,
  data?: T,
  method = "POST",
): Promise<R | false> {
  try {
    const result = await makeRequest<R, T>(requestHeader, url, method, data);
    return result as R;
  } catch (error) {
    console.warn(error);
    return false;
  }
}
