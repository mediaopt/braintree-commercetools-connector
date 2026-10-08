import { act, render } from "@testing-library/react";

type Handler = (event?: any) => void;
let hostedFieldsHandlers: Record<string, Handler>;
const mockTokenize = jest.fn();

jest.mock("braintree-web", () => ({
  hostedFields: {
    create: (
      _options: unknown,
      callback: (err: unknown, instance: unknown) => void,
    ) =>
      callback(null, {
        on: (event: string, handler: Handler) => {
          hostedFieldsHandlers[event] = handler;
        },
        tokenize: (...args: unknown[]) => mockTokenize(...args),
        getState: () => ({ fields: {} }),
      }),
  },
  dataCollector: {
    create: (
      _options: unknown,
      callback: (err: unknown, instance: unknown) => void,
    ) => callback(null, { deviceData: "device-data" }),
  },
}));

const mockVerifyCard = jest.fn();
jest.mock("../../app/useBraintreeClient", () => {
  // Stable references: the mask's setup effect depends on [client, threeDS].
  const braintreeClient = {
    client: {},
    threeDS: { verifyCard: (...args: unknown[]) => mockVerifyCard(...args) },
  };
  return { useBraintreeClient: () => braintreeClient };
});

const mockHandleTransactionSale = jest.fn();
jest.mock("../../app/usePayment", () => ({
  usePayment: () => ({
    handleTransactionSale: mockHandleTransactionSale,
    paymentInfo: { braintreeAmount: "10.00", email: "buyer@example.com" },
    braintreeCustomerId: undefined,
  }),
}));

const mockNotify = jest.fn();
jest.mock("../../app/useNotifications", () => ({
  useNotifications: () => ({ notify: mockNotify }),
}));

const mockIsLoading = jest.fn();
jest.mock("../../app/useLoader", () => ({
  useLoader: () => ({ isLoading: mockIsLoading }),
}));

import { CreditCardMask, SONGBIRD_WAIT_MS } from "./CreditCardMask";

const windowWithCardinal = window as { Cardinal?: unknown };

const tokenizeSucceeds = () =>
  mockTokenize.mockImplementation((_options, callback) =>
    callback(null, { nonce: "card-nonce", details: { bin: "411111" } }),
  );

const verifyCardReturns = (threeDSecureInfo: object) =>
  mockVerifyCard.mockResolvedValue({ nonce: "3ds-nonce", threeDSecureInfo });

describe("CreditCardMask — Checkout submit() and onError on 3D Secure and tokenize failures", () => {
  const mockOnError = jest.fn();
  let submit: (storePaymentDetails?: boolean) => Promise<void>;

  const fillCard = () =>
    act(() => {
      hostedFieldsHandlers.notEmpty({
        fields: {
          number: { isEmpty: false },
          cvv: { isEmpty: false },
          expirationDate: { isEmpty: false },
        },
      });
    });

  beforeEach(() => {
    hostedFieldsHandlers = {};
    windowWithCardinal.Cardinal = {};
    mockTokenize.mockReset();
    mockVerifyCard.mockReset();
    mockHandleTransactionSale.mockReset().mockResolvedValue(undefined);
    mockNotify.mockReset();
    mockIsLoading.mockReset();
    mockOnError.mockReset();

    render(
      <CreditCardMask
        onRegisterSubmit={(registered) => {
          submit = registered;
        }}
        onError={mockOnError}
      />,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    delete windowWithCardinal.Cardinal;
  });

  it("rejects and reports THREEDS_SONGBIRD_NOT_LOADED when Songbird never loads, without calling verifyCard", async () => {
    jest.useFakeTimers();
    delete windowWithCardinal.Cardinal;
    fillCard();
    tokenizeSucceeds();

    const assertion = expect(submit()).rejects.toMatchObject({
      code: "THREEDS_SONGBIRD_NOT_LOADED",
    });
    await jest.advanceTimersByTimeAsync(SONGBIRD_WAIT_MS);
    await assertion;

    expect(mockVerifyCard).not.toHaveBeenCalled();
    expect(mockIsLoading).toHaveBeenLastCalledWith(false);
    expect(mockNotify).toHaveBeenCalledWith(
      "Error",
      "Something went wrong - try again",
    );
    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "THREEDS_SONGBIRD_NOT_LOADED" }),
    );
  });

  it("continues with verifyCard when Songbird finishes loading during the wait", async () => {
    jest.useFakeTimers();
    delete windowWithCardinal.Cardinal;
    fillCard();
    tokenizeSucceeds();
    verifyCardReturns({
      status: "authenticate_successful",
      liabilityShifted: true,
    });

    const result = submit();
    await jest.advanceTimersByTimeAsync(SONGBIRD_WAIT_MS / 2);
    windowWithCardinal.Cardinal = {};
    await jest.advanceTimersByTimeAsync(SONGBIRD_WAIT_MS / 2);

    await expect(result).resolves.toBeUndefined();
    expect(mockVerifyCard).toHaveBeenCalled();
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it("runs transactionSale with the 3DS nonce when liability shifted", async () => {
    fillCard();
    tokenizeSucceeds();
    verifyCardReturns({
      status: "authenticate_successful",
      liabilityShifted: true,
    });

    await expect(submit()).resolves.toBeUndefined();

    expect(mockVerifyCard).toHaveBeenCalledWith(
      expect.objectContaining({
        nonce: "card-nonce",
        bin: "411111",
        amount: "10.00",
      }),
    );
    expect(mockHandleTransactionSale).toHaveBeenCalledWith("3ds-nonce", {
      deviceData: "device-data",
    });
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it("rejects and reports 3DS_AUTHENTICATION_FAILED when 3DS authentication isn't successful", async () => {
    fillCard();
    tokenizeSucceeds();
    verifyCardReturns({ status: "authenticate_rejected" });

    await expect(submit()).rejects.toThrow(
      "Could not authenticate: authenticate_rejected",
    );

    expect(mockHandleTransactionSale).not.toHaveBeenCalled();
    expect(mockIsLoading).toHaveBeenLastCalledWith(false);
    expect(mockNotify).toHaveBeenCalledWith("Error", "Could not authenticate");
    expect(mockOnError).toHaveBeenCalledWith({
      code: "3DS_AUTHENTICATION_FAILED",
      message: "Could not authenticate: authenticate_rejected",
    });
  });

  it("reports our code with the Braintree code and requestId, never the SDK message, when verifyCard rejects with a lookup error", async () => {
    fillCard();
    tokenizeSucceeds();
    mockVerifyCard.mockRejectedValue({
      name: "BraintreeError",
      code: "THREEDS_LOOKUP_VALIDATION_ERROR",
      message: "lookup failed for 1 Private Street",
      details: {
        originalError: { extensions: { requestId: "req-123" } },
      },
    });
    const expected =
      "3D Secure verification failed. (Braintree error code: THREEDS_LOOKUP_VALIDATION_ERROR, Braintree requestId: req-123)";

    await expect(submit()).rejects.toMatchObject({
      code: "THREEDS_VERIFY_FAILED",
      message: expected,
    });

    expect(mockIsLoading).toHaveBeenLastCalledWith(false);
    expect(mockNotify).toHaveBeenCalledWith(
      "Error",
      "Validation error - check your input or try a different payment",
    );
    expect(mockOnError).toHaveBeenCalledWith({
      code: "THREEDS_VERIFY_FAILED",
      message: expected,
    });
  });

  it("still notifies and reports when verifyCard rejects with an error that has no code", async () => {
    fillCard();
    tokenizeSucceeds();
    mockVerifyCard.mockRejectedValue(
      new TypeError("Cannot read properties of undefined"),
    );

    await expect(submit()).rejects.toMatchObject({
      code: "THREEDS_VERIFY_FAILED",
      message: "3D Secure verification failed.",
    });

    expect(mockNotify).toHaveBeenCalledWith(
      "Error",
      "Something went wrong - try again",
    );
    expect(mockOnError).toHaveBeenCalledWith({
      code: "THREEDS_VERIFY_FAILED",
      message: "3D Secure verification failed.",
    });
  });

  it("reports our code with the Braintree code, never the SDK message, when tokenize fails, without calling verifyCard", async () => {
    fillCard();
    mockTokenize.mockImplementation((_options, callback) =>
      callback({
        name: "BraintreeError",
        code: "HOSTED_FIELDS_FAILED_TOKENIZATION",
        message: "tokenize failed for 4111 1111 1111 1111",
      }),
    );
    const expected =
      "Card details could not be tokenized. (Braintree error code: HOSTED_FIELDS_FAILED_TOKENIZATION)";

    await expect(submit()).rejects.toMatchObject({
      code: "TOKENIZE_FAILED",
      message: expected,
    });

    expect(mockVerifyCard).not.toHaveBeenCalled();
    expect(mockIsLoading).toHaveBeenLastCalledWith(false);
    expect(mockOnError).toHaveBeenCalledWith({
      code: "TOKENIZE_FAILED",
      message: expected,
    });
  });

  it("rejects without tokenizing when the card fields are empty", async () => {
    await expect(submit()).rejects.toThrow("empty fields");

    expect(mockTokenize).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      "Error",
      "Please fill in all card details.",
    );
  });
});
