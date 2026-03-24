import { RequestHeader } from "../types";

export const makeRequest = <ResponseType, T>(
  requestHeader: RequestHeader,
  url: string,
  method?: string,
  data?: T
) => {
  let headers: Headers = new Headers({
    ...requestHeader,
    "Content-Type": "application/json",
  });

  const requestData: RequestInit = {
    method: method ?? "GET",
    mode: "cors",
    cache: "no-cache",
    credentials: "same-origin",
    redirect: "follow",
    referrerPolicy: "no-referrer",
    headers: headers,
  };

  if (data) {
    requestData.body = JSON.stringify(data);
  }

  return fetch(url, requestData)
    .then((response) => {
      return response.json();
    })
    .then((responseData) => {
      return responseData as ResponseType;
    })
    .catch((error) => console.warn(error));
};
