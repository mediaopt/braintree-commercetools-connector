import { act, fireEvent, render } from "@testing-library/react";

type Callback = (err: unknown, instance?: unknown) => void;
const mockTokenize = jest.fn();
const mockDataCollectorCreate = jest.fn((_options: unknown, cb: Callback) =>
  cb(null, { deviceData: "device-data" }),
);

jest.mock("braintree-web", () => ({
  client: { create: (_options: unknown, cb: Callback) => cb(null, {}) },
  usBankAccount: {
    create: (_options: unknown, cb: Callback) =>
      cb(null, { tokenize: (...args: unknown[]) => mockTokenize(...args) }),
  },
  dataCollector: {
    create: (options: unknown, cb: Callback) =>
      mockDataCollectorCreate(options, cb),
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
    currentRequestHeader: () => ({}),
    paymentInfo: {
      ctPaymentId: "payment-123",
      ctCustomerId: "customer-123" as string | undefined,
      currency: "USD",
      braintreeAmount: 10,
      firstName: "Jane",
      lastName: "Doe",
      streetName: "Main St",
      streetNumber: "1",
      postalCode: "10001",
    },
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
import { usePayment } from "../../app/usePayment";
import { FORM_INCOMPLETE_TEXT, SIGN_IN_TEXT } from "./constants";

// the mocked context is one stable object: a test changes the customer before rendering
const setCtCustomerId = (ctCustomerId: string | undefined) => {
  usePayment().paymentInfo.ctCustomerId = ctCustomerId;
};

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
      cb({
        code: "US_BANK_ACCOUNT_TOKENIZE_FAILED",
        message: "bank 1000000000",
      }),
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
    // only our code: the processor accepts no free text
    expect(mockProcessorRequest.mock.calls[0][2].logFrontendIssue).toBe(
      "ACH_TOKENIZE_FAILED",
    );
  });

  it("the next vault request carries every browser failure since the last one", async () => {
    mockTokenize
      .mockImplementationOnce((_options, cb) => cb({ code: "X" }))
      .mockImplementationOnce((_options, cb) => cb(undefined, undefined))
      .mockImplementationOnce((_options, cb) =>
        cb(undefined, { nonce: "bank-nonce" }),
      );
    mockProcessorRequest.mockResolvedValue(undefined);

    await expect(submit()).rejects.toMatchObject({
      code: "ACH_TOKENIZE_FAILED",
    });
    await expect(submit()).rejects.toMatchObject({
      code: "ACH_TOKENIZE_NO_NONCE",
    });
    await expect(submit()).rejects.toMatchObject({
      code: "ACH_VAULT_REQUEST_FAILED",
    });

    expect(mockProcessorRequest.mock.calls[0][2].logFrontendIssue).toBe(
      "ACH_TOKENIZE_FAILED; ACH_TOKENIZE_NO_NONCE",
    );
  });

  it("a retry whose device data collection fails sends no device data from the attempt before", async () => {
    mockTokenize.mockImplementation((_options, cb) =>
      cb(undefined, { nonce: "bank-nonce" }),
    );
    mockProcessorRequest.mockResolvedValue({
      status: true,
      token: "vault-token",
      verified: true,
    });
    mockHandleTransactionSale.mockResolvedValue(undefined);
    jest.spyOn(console, "warn").mockImplementation();

    await submit();
    mockDataCollectorCreate.mockImplementationOnce((_options, cb) =>
      cb(new Error("blocked")),
    );
    await submit();

    expect(mockHandleTransactionSale.mock.calls[0][1].deviceData).toBe(
      "device-data",
    );
    expect(mockHandleTransactionSale.mock.calls[1][1].deviceData).toBe("");
    jest.mocked(console.warn).mockRestore();
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

  // the processor vaults to the cart's customer; the browser can't choose it
  it("sends the vault request without customer ids", async () => {
    mockTokenize.mockImplementation((_options, cb) =>
      cb(undefined, { nonce: "bank-nonce" }),
    );
    mockProcessorRequest.mockResolvedValue({
      token: "bank-token",
      verified: true,
    });
    mockHandleTransactionSale.mockResolvedValue(undefined);

    await submit();

    const [, , vaultRequest] = mockProcessorRequest.mock.calls.find(([, url]) =>
      url.endsWith("/getAchVaultToken"),
    )!;
    expect(vaultRequest).toEqual(
      expect.objectContaining({
        paymentMethodNonce: "bank-nonce",
        ctPaymentId: "payment-123",
      }),
    );
    expect(vaultRequest).not.toHaveProperty("ctCustomerId");
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

describe("ACHMask — before tokenize", () => {
  const mockOnError = jest.fn();
  let submit: () => Promise<void>;
  let validation: {
    isValid: () => Promise<boolean>;
    showValidation: () => Promise<void>;
  };

  const renderMask = () =>
    render(
      <ACHMask
        processorUrl="https://processor.example"
        onRegisterSubmit={(registered) => {
          submit = registered;
        }}
        onRegisterValidation={(registered) => {
          validation = registered;
        }}
        onError={mockOnError}
      />,
    );

  beforeEach(() => {
    mockTokenize.mockReset();
    mockNotify.mockReset();
    mockOnError.mockReset();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    setCtCustomerId("customer-123");
    jest.mocked(console.error).mockRestore();
  });

  it("rejects with ACH_FORM_INCOMPLETE while required fields are empty", async () => {
    renderMask();

    await expect(submit()).rejects.toMatchObject({
      code: "ACH_FORM_INCOMPLETE",
    });

    expect(mockNotify).toHaveBeenCalledWith("Error", FORM_INCOMPLETE_TEXT);
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ACH_FORM_INCOMPLETE" }),
    );
    expect(mockTokenize).not.toHaveBeenCalled();
  });

  it("a guest sees the sign-in notice instead of the form and can't submit", async () => {
    setCtCustomerId(undefined);
    const { container, getByText } = renderMask();

    expect(getByText(SIGN_IN_TEXT)).toBeTruthy();
    expect(container.querySelector("#routing-number")).toBeNull();
    await expect(validation.isValid()).resolves.toBe(false);
    await expect(submit()).rejects.toMatchObject({
      code: "ACH_SIGN_IN_REQUIRED",
    });
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ACH_SIGN_IN_REQUIRED" }),
    );
    expect(mockTokenize).not.toHaveBeenCalled();
  });

  it("showValidation tells a guest to sign in", async () => {
    setCtCustomerId(undefined);
    renderMask();

    await validation.showValidation();

    expect(mockNotify).toHaveBeenCalledWith("Error", SIGN_IN_TEXT);
    expect(mockOnError).toHaveBeenCalledWith({
      code: "ACH_SIGN_IN_REQUIRED",
      message: SIGN_IN_TEXT,
    });
  });
});
