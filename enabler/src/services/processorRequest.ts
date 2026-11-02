import { makeRequest } from "../api";
import { RequestHeader } from "../types";

export async function processorRequest<T = undefined, R = any>(
  requestHeader: RequestHeader,
  url: string,
  data?: T,
  method = "POST",
): Promise<R | undefined> {
  try {
    return await makeRequest<R, T>(requestHeader, url, method, data);
  } catch {
    // Not the error itself: a JSON parse error quotes part of the response body.
    console.warn(`Processor request to ${url} failed.`);
    return undefined;
  }
}
