import { getClientToken } from "./getClientToken";
import { createPayment } from "./createPayment";
import { CartInformation, RequestHeader } from "../types";
import { makeRequest } from "../api";

jest.mock("../api/request", () => {
  return {
    makeRequest: <ResponseType, T>(
      requestHeader: RequestHeader,
      url: string,
      method?: string,
      data?: T
    ) => {
      switch (url) {
        case "fail":
          return new Promise((resolve) => {
            process.nextTick(() => {
              try {
                throw Error("");
              } catch (e) {
                resolve(false);
              }
            });
          });
        case "getClientToken":
          return new Promise<ResponseType>((resolve, reject) => {
            process.nextTick(() => {
              resolve({
                clientToken: "test",
                paymentVersion: 1,
              } as ResponseType);
            });
          });
        case "createPayment":
          return new Promise<ResponseType>((resolve, reject) => {
            process.nextTick(() => {
              resolve({
                id: "test",
                version: 1,
                amountPlanned: {
                  centAmount: 111,
                  currencyCode: "EUR",
                  fractionDigits: 2,
                },
              } as ResponseType);
            });
          });
        default:
      }
    },
  };
});

test("error on make request", () => {
  expect.assertions(1);
  return makeRequest({}, "fail", "", 1).then((result) => {
    expect(result).toBeFalsy();
  });
});

describe("Client token", () => {
  test("getting clientToken", () => {
    expect.assertions(2);
    return getClientToken({}, "getClientToken", "", 1).then((result) => {
      expect(result).toHaveProperty("clientToken");
      expect(result).toHaveProperty("paymentVersion");
    });
  });
});

describe("Create payment", () => {
  test("creating payment", () => {
    const cartInformation = {} as CartInformation;
    expect.assertions(2);
    return createPayment({}, "createPayment", cartInformation).then(
      (result) => {
        expect(result).toHaveProperty("amountPlanned");
        expect(result).toHaveProperty("version");
      }
    );
  });
});
