import { act, fireEvent, render } from "@testing-library/react";

type Callback = (err: unknown, instance?: unknown) => void;
const mockTokenize = jest.fn();

jest.mock("braintree-web", () => ({
  client: { create: (_options: unknown, cb: Callback) => cb(null, {}) },
  usBankAccount: {
    create: (_options: unknown, cb: Callback) =>
      cb(null, { tokenize: (...args: unknown[]) => mockTokenize(...args) }),
  },
  dataCollector: {
    create: (_options: unknown, cb: Callback) =>
      cb(null, { deviceData: "device-data" }),
  },
}));

const mockProcessorRequest = jest.fn();
jest.mock("../../services/processorRequest", () => ({
  processorRequest: (...args: unknown[]) => mockProcessorRequest(...args),
}));

const mockHandleTransactionSale = jest.fn();
jest.mock("../../app/usePayment", () => {
  // Stable reference: the mask's effects depend on paymentInfo.
  const payment = {
    handleTransactionSale: (...args: unknown[]) =>
      mockHandleTransactionSale(...args),
    clientToken: "client-token",
    requestHeader: {},
    paymentInfo: {
      ctPaymentId: "payment-123",
      currency: "USD",
      braintreeAmount: 10,
      firstName: "Jane",
      lastName: "Doe",
      streetName: "Main St",
      streetNumber: "1",
      postalCode: "10001",
    },
    braintreeCustomerId: undefined,
  };
  return { usePayment: () => payment };
});

const mockNotify = jest.fn();
jest.mock("../../app/useNotifications", () => ({
  useNotifications: () => ({ notify: mockNotify }),
}));

jest.mock("../../app/useLoader", () => ({
  useLoader: () => ({ isLoading: jest.fn() }),
}));

import { ACHMask } from "./ACHMask";

const fill = (container: HTMLElement, id: string, value: string) =>
  fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });

describe("ACHMask — Checkout submit() always settles", () => {
  const mockOnError = jest.fn();
  let submit: () => Promise<void>;

  beforeEach(() => {
    mockTokenize.mockReset();
    mockProcessorRequest.mockReset();
    mockHandleTransactionSale.mockReset();
    mockNotify.mockReset();
    mockOnError.mockReset();
    jest.spyOn(console, "error").mockImplementation();

    const { container } = render(
      <ACHMask
        processorUrl="https://processor.example"
        onRegisterSubmit={(registered) => {
          submit = registered;
        }}
        onError={mockOnError}
      />,
    );
    act(() => {
      fill(container, "routing-number", "011000015");
      fill(container, "account-number", "1000000000");
      fill(container, "account-type", "checking");
      fill(container, "ownership-type", "personal");
      fill(container, "locality", "New York");
      fill(container, "region", "NY");
    });
  });

  afterEach(() => {
    jest.mocked(console.error).mockRestore();
  });

  it("rejects with ACH_TOKENIZE_NO_NONCE when tokenize returns neither an error nor a payload", async () => {
    mockTokenize.mockImplementation((_options, cb) => cb(undefined, undefined));

    await expect(submit()).rejects.toMatchObject({
      code: "ACH_TOKENIZE_NO_NONCE",
    });

    expect(mockProcessorRequest).not.toHaveBeenCalled();
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ACH_TOKENIZE_NO_NONCE" }),
    );
  });

  it("rejects with ACH_TOKENIZE_FAILED without the Braintree message, and the next vault request carries it", async () => {
    mockTokenize.mockImplementationOnce((_options, cb) =>
      cb({ code: "US_BANK_ACCOUNT_TOKENIZE_FAILED", message: "bank 1000000000" }),
    );

    await expect(submit()).rejects.toMatchObject({
      code: "ACH_TOKENIZE_FAILED",
    });

    expect(mockNotify).toHaveBeenCalledWith(
      "Error",
      "There was an error tokenizing the bank details.",
    );
    const reported = mockOnError.mock.calls[0][0];
    expect(reported.code).toBe("ACH_TOKENIZE_FAILED");
    expect(reported.message).not.toContain("1000000000");

    mockTokenize.mockImplementationOnce((_options, cb) =>
      cb(undefined, { nonce: "bank-nonce" }),
    );
    mockProcessorRequest.mockResolvedValue(undefined);
    await expect(submit()).rejects.toMatchObject({
      code: "ACH_VAULT_REQUEST_FAILED",
    });
    expect(mockProcessorRequest.mock.calls[0][2].logFrontendIssue).toMatch(
      /^ACH_TOKENIZE_FAILED: /,
    );
  });

  it("reports a failed instant-verified sale to onError and rejects with its coded error", async () => {
    mockTokenize.mockImplementation((_options, cb) =>
      cb(undefined, { nonce: "bank-nonce" }),
    );
    mockProcessorRequest.mockResolvedValue({
      status: true,
      token: "vault-token",
      verified: true,
    });
    mockHandleTransactionSale.mockRejectedValue(
      Object.assign(new Error("Payment failed"), {
        code: "TRANSACTION_SALE_FAILED",
      }),
    );

    await expect(submit()).rejects.toMatchObject({
      code: "TRANSACTION_SALE_FAILED",
    });
    expect(mockOnError).toHaveBeenCalledWith({
      code: "TRANSACTION_SALE_FAILED",
      message: "Payment failed",
    });
  });

  it("rejects with ACH_UNEXPECTED_ERROR when something throws inside the tokenize callback", async () => {
    mockTokenize.mockImplementation((_options, cb) =>
      cb(undefined, { nonce: "bank-nonce" }),
    );
    mockProcessorRequest.mockRejectedValue(new TypeError("unexpected"));

    await expect(submit()).rejects.toMatchObject({
      code: "ACH_UNEXPECTED_ERROR",
    });

    expect(mockHandleTransactionSale).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      "Error",
      "Something went wrong - try again",
    );
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ACH_UNEXPECTED_ERROR" }),
    );
  });
});
