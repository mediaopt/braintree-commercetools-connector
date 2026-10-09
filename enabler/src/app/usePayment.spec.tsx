import { act, render, waitFor } from "@testing-library/react";

jest.mock("../services/processorRequest", () => ({
  processorRequest: jest.fn(),
}));

import { processorRequest } from "../services/processorRequest";
import { PaymentProvider, usePayment } from "./usePayment";

const mockedProcessorRequest = processorRequest as jest.MockedFunction<
  typeof processorRequest
>;

const PROCESSOR_URL = "https://processor.test";

// X-Session-Id sent with the request to the given URL suffix
const sessionSentTo = (urlSuffix: string) =>
  mockedProcessorRequest.mock.calls
    .filter(([, url]) => url === `${PROCESSOR_URL}/payments${urlSuffix}`)
    .map(([header]) => header["X-Session-Id"]);

const createPaymentResponse = {
  braintreeData: { clientToken: "click-token", braintreeCustomerId: "" },
  payment: {
    ctPaymentId: "click-payment",
    braintreeAmount: 10,
    currency: "USD",
  },
};

// Props every render shares
const mockProviderProps = {
  processorUrl: PROCESSOR_URL,
  sessionId: "mount-session",
  purchaseCallback: () => {},
  paymentMethodType: "PayPal",
  builderType: "express",
  deferredPaymentCreation: true,
  initialAmount: { centAmount: 1000, currencyCode: "USD", fractionDigits: 2 },
} as any;

// Renders a deferred-mode (PayPal Express without a cart) provider and returns the context value
// captured once the mount-time client token arrived — like PayPalMask, which keeps using that value.
const renderDeferredProvider = async (sessionId = "mount-session") => {
  let payment: ReturnType<typeof usePayment> | undefined;
  const Consumer = () => {
    payment = usePayment();
    return null;
  };
  render(
    <PaymentProvider {...mockProviderProps} sessionId={sessionId}>
      <Consumer />
    </PaymentProvider>,
  );
  await waitFor(() => expect(payment?.clientToken).toBe("mount-token"));
  return payment!;
};

describe("usePayment — PayPal Express session switch", () => {
  beforeEach(() => {
    mockedProcessorRequest.mockReset();
    mockedProcessorRequest.mockImplementation(async (_header, url) => {
      if (url.endsWith("/expressClientToken"))
        return {
          braintreeData: {
            clientToken: "mount-token",
            braintreeCustomerId: "",
          },
        };
      if (url.endsWith("/updateCartShipping"))
        return { braintreeAmount: "10.00", shippingAmount: "0.00" };
      return createPaymentResponse;
    });
  });

  it("sends createPayment and every later call with the session onPayButtonClick resolved with", async () => {
    const payment = await renderDeferredProvider();

    await act(() => payment.createExpressPayment("click-session"));
    await act(() => payment.updateCartShipping("method-1"));

    expect(sessionSentTo("/expressClientToken")).toEqual(["mount-session"]);
    expect(sessionSentTo("")).toEqual(["click-session"]);
    expect(sessionSentTo("/updateCartShipping")).toEqual(["click-session"]);
  });

  it("warns and keeps the current session when onPayButtonClick resolves without one", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const payment = await renderDeferredProvider();

    await act(() => payment.createExpressPayment(undefined));

    expect(sessionSentTo("")).toEqual(["mount-session"]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("onPayButtonClick resolved without a sessionId"),
    );
    warn.mockRestore();
  });

  it("refuses before createPayment when onPayButtonClick resolves without a session and there is none", async () => {
    const payment = await renderDeferredProvider("");

    // Throws before any state update, so no act() is needed
    await expect(payment.createExpressPayment(undefined)).rejects.toThrow(
      "there is no current session",
    );

    expect(sessionSentTo("")).toEqual([]);
  });
});
