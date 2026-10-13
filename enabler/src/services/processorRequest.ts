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
  } catch {
    // Not the error itself: a JSON parse error quotes part of the response body.
    console.warn(`Processor request to ${url} failed.`);
    return false;
  }
}
