import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("braintree-web", () => ({
  client: {
    create: (_options: unknown, callback: (err: unknown, i: unknown) => void) =>
      callback(null, {}),
  },
  dataCollector: {
    create: (_options: unknown, callback: (err: unknown, i: unknown) => void) =>
      callback(null, { deviceData: "device-data" }),
  },
  venmo: {
    create: (_options: unknown, callback: (err: unknown, i: unknown) => void) =>
      callback(null, {
        isBrowserSupported: () => true,
        hasTokenizationResult: () => false,
        tokenize: (
          _options: unknown,
          cb: (err: unknown, payload: unknown) => void,
        ) => cb(null, { nonce: "venmo-nonce", details: { username: "joe" } }),
      }),
  },
}));

const mockHandleTransactionSale = jest.fn();
jest.mock("../../app/usePayment", () => {
  // Stable reference: the mask's setup effect depends on paymentInfo.
  const payment = {
    handleTransactionSale: (...args: unknown[]) =>
      mockHandleTransactionSale(...args),
    paymentInfo: {},
    clientToken: "client-token",
  };
  return { usePayment: () => payment };
});

jest.mock("../../app/useNotifications", () => ({
  useNotifications: () => ({ notify: jest.fn() }),
}));

import { VenmoMask } from "./VenmoMask";

describe("VenmoMask", () => {
  it("doesn't leave a declined transactionSale as an unhandled rejection", async () => {
    // handleTransactionSale has already shown the toast when it rejects.
    mockHandleTransactionSale.mockRejectedValue(
      new Error("The payment could not be completed."),
    );
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);

    render(
      <VenmoMask
        buttonText="Venmo"
        mobileWebFallBack={false}
        desktopFlow="desktopWebLogin"
        paymentMethodUsage="single_use"
      />,
    );
    fireEvent.submit(screen.getByText("Venmo").closest("form")!);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(mockHandleTransactionSale).toHaveBeenCalledWith(
      "venmo-nonce",
      expect.objectContaining({ venmoUsername: "joe" }),
    );
    expect(unhandled).not.toHaveBeenCalled();
    process.off("unhandledRejection", unhandled);
  });
});
