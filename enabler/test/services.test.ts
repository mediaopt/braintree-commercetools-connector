import { CreatePaymentResponse, RequestHeader } from "../src/types";
import { makeRequest } from "../src/api";
import { processorRequest } from "../src/services/processorRequest";
import { CreatePaymentRequest } from "../src/services/types";

const mockPaymentResponse = {
  braintreeData: {
    clientToken: "",
    braintreeCustomerId: "",
  },
  payment: { ctPaymentId: "", braintreeAmount: 22, currency: "" },
};

jest.mock("../src/api/request", () => {
  return {
    makeRequest: <ResponseType, T>(
      requestHeader: RequestHeader,
      url: string,
      method?: string,
      data?: T,
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
        case "createPaymentUrl":
          return new Promise<ResponseType>((resolve, reject) => {
            process.nextTick(() => {
              resolve(mockPaymentResponse as ResponseType);
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

describe("Create payment", () => {
  test("creating payment", () => {
    expect.assertions(2);
    return processorRequest<CreatePaymentRequest, CreatePaymentResponse>(
      {},
      "createPaymentUrl",
      { builderType: undefined, paymentMethodType: "PayPal" },
    ).then((result) => {
      expect(result).toHaveProperty("braintreeData");
      expect(result).toHaveProperty("payment");
    });
  });
});
