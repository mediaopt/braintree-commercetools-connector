import { render, waitFor } from "@testing-library/react";

let capturedButtonsConfig: any;
const mockPayPalCreatePayment = jest.fn();
jest.mock("braintree-web", () => ({
  client: {
    create: (_options: unknown, callback: (err: unknown, i: unknown) => void) =>
      callback(null, {}),
  },
  dataCollector: {
    create: (_options: unknown, callback: (err: unknown, i: unknown) => void) =>
      callback(null, { deviceData: "device-data" }),
  },
  paypalCheckout: {
    create: (_options: unknown, callback: (err: unknown, i: unknown) => void) =>
      callback(null, {
        loadPayPalSDK: (_options: unknown, loaded: () => void) => loaded(),
        createPayment: (...args: unknown[]) => mockPayPalCreatePayment(...args),
      }),
  },
}));

const mockUsePayment = jest.fn();
jest.mock("../../app/usePayment", () => ({
  usePayment: () => mockUsePayment(),
}));

const mockCreateExpressPayment = jest.fn();
// Stable reference: the mask's setup effect depends on paymentInfo.
const basePaymentMock = {
  handleTransactionSale: jest.fn(),
  updateCartShipping: jest.fn(),
  createExpressPayment: mockCreateExpressPayment,
  paymentInfo: { ctPaymentId: "", braintreeAmount: 10, currency: "USD" },
  clientToken: "mount-token",
};

jest.mock("../../app/useLoader", () => ({
  useLoader: () => ({ isLoading: jest.fn() }),
}));
jest.mock("../../app/useNotifications", () => ({
  useNotifications: () => ({ notify: jest.fn() }),
}));

import { PayPalMask } from "./PayPalMask";

// Props every render shares; required by PayPalProps but irrelevant to createOrder
const baseProps = {
  flow: "checkout",
  buttonColor: "gold",
  buttonLabel: "paypal",
} as any;

const clickResult = {
  clientToken: "click-token",
  braintreeCustomerId: "",
  paymentInfo: {
    ctPaymentId: "click-payment",
    braintreeAmount: 10,
    currency: "USD",
  },
};

// Mounts the deferred PayPal Express mask; the PayPal Buttons config it renders is captured
const mountDeferredExpress = async (onError: jest.Mock) => {
  (global as any).paypal = {
    Buttons: (config: any) => {
      capturedButtonsConfig = config;
      return { render: jest.fn() };
    },
  };
  render(
    <PayPalMask
      {...baseProps}
      onExpressPayButtonClick={() =>
        Promise.resolve({ sessionId: "click-session" })
      }
      onError={onError}
    />,
  );
  await waitFor(() => expect(capturedButtonsConfig).toBeDefined());
};

describe("PayPalMask — PayPal Express deferred createOrder", () => {
  beforeEach(() => {
    capturedButtonsConfig = undefined;
    mockCreateExpressPayment.mockReset();
    mockPayPalCreatePayment.mockReset();
    mockUsePayment.mockReset().mockReturnValue(basePaymentMock);
  });

  it("creates the Payment with the session onPayButtonClick resolved with", async () => {
    mockCreateExpressPayment.mockResolvedValue(clickResult);
    mockPayPalCreatePayment.mockResolvedValue("paypal-order-id");
    const onError = jest.fn();
    await mountDeferredExpress(onError);

    await expect(capturedButtonsConfig.createOrder()).resolves.toBe(
      "paypal-order-id",
    );

    expect(mockCreateExpressPayment).toHaveBeenCalledWith("click-session");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a failed click to onError without a paymentReference when no Payment was created", async () => {
    mockCreateExpressPayment.mockRejectedValue(new Error("processor detail"));
    const onError = jest.fn();
    await mountDeferredExpress(onError);

    await expect(capturedButtonsConfig.createOrder()).rejects.toThrow(
      "processor detail",
    );

    expect(onError).toHaveBeenCalledWith(
      {
        code: "EXPRESS_CREATE_ORDER_FAILED",
        message: "The PayPal Express order could not be created.",
      },
      { paymentReference: undefined },
    );
  });

  it("reports the Payment created on click as paymentReference when PayPal's createPayment fails", async () => {
    mockCreateExpressPayment.mockResolvedValue(clickResult);
    mockPayPalCreatePayment.mockRejectedValue(new Error("Braintree detail"));
    const onError = jest.fn();
    await mountDeferredExpress(onError);

    await expect(capturedButtonsConfig.createOrder()).rejects.toThrow(
      "Braintree detail",
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "EXPRESS_CREATE_ORDER_FAILED" }),
      { paymentReference: "click-payment" },
    );
  });
});
