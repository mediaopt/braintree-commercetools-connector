import { makeRequest } from "../api";
import { RequestHeader } from "../types";

export async function processorRequest<T, R = any>(
  requestHeader: RequestHeader,
  url: string,
  data: T,
): Promise<R | false> {
  try {
    const result = await makeRequest<R, T>(requestHeader, url, "POST", data);
    return result as R;
  } catch (error) {
    console.warn(error);
    return false;
  }
}
