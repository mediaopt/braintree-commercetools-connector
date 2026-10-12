import { render } from "@testing-library/react";

const mockHandleTransactionSale = jest.fn();
jest.mock("../../app/usePayment", () => ({
  usePayment: () => ({
    handleTransactionSale: mockHandleTransactionSale,
    paymentInfo: { braintreeLineItems: [] },
  }),
}));

jest.mock("../../app/useNotifications", () => ({
  useNotifications: () => ({ notify: jest.fn() }),
}));

jest.mock("../../app/useLoader", () => ({
  useLoader: () => ({ isLoading: jest.fn() }),
}));

import { CreditCardStoredButton } from "./CreditCardStoredButton";

describe("CreditCardStored — Checkout submit()", () => {
  const mockOnError = jest.fn();
  let submit: () => Promise<void>;

  beforeEach(() => {
    mockHandleTransactionSale.mockReset().mockResolvedValue(undefined);
    mockOnError.mockReset();
    render(
      <CreditCardStoredButton
        id="stored-token"
        onRegisterSubmit={(registered) => {
          submit = registered;
        }}
        onError={mockOnError}
      />,
    );
  });

  it("pays with the stored token", async () => {
    await expect(submit()).resolves.toBeUndefined();

    expect(mockHandleTransactionSale).toHaveBeenCalledWith("", {
      paymentToken: "stored-token",
      lineItems: [],
    });
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it("reports a failed sale to onError and rejects with it", async () => {
    const saleFailure = {
      code: "TRANSACTION_SALE_FAILED",
      message: "The payment could not be completed.",
    };
    mockHandleTransactionSale.mockRejectedValue(
      Object.assign(new Error(saleFailure.message), {
        code: saleFailure.code,
      }),
    );

    await expect(submit()).rejects.toMatchObject(saleFailure);

    expect(mockOnError).toHaveBeenCalledWith(saleFailure);
  });
});
