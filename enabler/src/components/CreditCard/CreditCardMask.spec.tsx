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
const mockCancelVerifyCard = jest.fn();
const mockThreeDSHandlers: Record<string, Set<Handler>> = {};
const emitThreeDS = (event: string, data?: unknown) =>
  mockThreeDSHandlers[event]?.forEach((handler) => handler(data));
jest.mock("../../app/useBraintreeClient", () => {
  // Stable references: the mask's setup effect depends on [client, threeDS].
  const braintreeClient = {
    client: {},
    threeDS: {
      verifyCard: (...args: unknown[]) => mockVerifyCard(...args),
      cancelVerifyCard: (...args: unknown[]) => mockCancelVerifyCard(...args),
      on: (event: string, handler: Handler) => {
        (mockThreeDSHandlers[event] ??= new Set()).add(handler);
      },
      off: (event: string, handler: Handler) => {
        mockThreeDSHandlers[event]?.delete(handler);
      },
    },
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

import { CreditCardMask, CHALLENGE_SHOW_TIMEOUT_MS } from "./CreditCardMask";

const windowWithCardinal = window as { Cardinal?: unknown };

const tokenizeSucceeds = () =>
  mockTokenize.mockImplementation((_options, callback) =>
    callback(null, { nonce: "card-nonce", details: { bin: "411111" } }),
  );

const verifyCardReturns = (threeDSecureInfo: object) =>
  mockVerifyCard.mockResolvedValue({ nonce: "3ds-nonce", threeDSecureInfo });

// verifyCard emits lookup-complete like the SDK, then settles only when the test calls the result.
const verifyCardAfterLookup = (requiresUserAuthentication: boolean) => {
  let resolve!: (value: unknown) => void;
  mockVerifyCard.mockImplementation(() => {
    emitThreeDS("lookup-complete", { requiresUserAuthentication });
    return new Promise((r) => {
      resolve = r;
    });
  });
  return (threeDSecureInfo: object) =>
    resolve({ nonce: "3ds-nonce", threeDSecureInfo });
};

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
    mockCancelVerifyCard.mockReset();
    Object.keys(mockThreeDSHandlers).forEach(
      (event) => delete mockThreeDSHandlers[event],
    );
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

  it.each([
    {
      songbird: "missing",
      code: "THREEDS_SONGBIRD_NOT_LOADED",
      message:
        "3D Secure challenge was not shown within 10 s: Cardinal's Songbird.js (3D Secure) was not loaded. If you are the domain owner, please whitelist the hosts listed in https://braintree.github.io/braintree-web/current/#content-security-policy.",
    },
    {
      songbird: "present",
      code: "THREEDS_CHALLENGE_NOT_SHOWN",
      message: "3D Secure challenge was not shown within 10 s.",
    },
  ])(
    "cancels and reports $code when a requested challenge isn't shown in time (Songbird $songbird)",
    async ({ songbird, code, message }) => {
      jest.useFakeTimers();
      const consoleError = jest.spyOn(console, "error").mockImplementation();
      if (songbird === "missing") delete windowWithCardinal.Cardinal;
      fillCard();
      tokenizeSucceeds();
      verifyCardAfterLookup(true);

      const assertion = expect(submit()).rejects.toMatchObject({
        code,
        message,
      });
      await jest.advanceTimersByTimeAsync(CHALLENGE_SHOW_TIMEOUT_MS);
      await assertion;

      expect(mockCancelVerifyCard).toHaveBeenCalled();
      expect(mockHandleTransactionSale).not.toHaveBeenCalled();
      expect(mockIsLoading).toHaveBeenLastCalledWith(false);
      expect(mockNotify).toHaveBeenCalledWith(
        "Error",
        "Something went wrong - try again",
      );
      expect(mockOnError).toHaveBeenCalledWith({ code, message });
      expect(consoleError).toHaveBeenCalledWith(message);
      consoleError.mockRestore();
    },
  );

  it("keeps waiting for the shopper once the challenge iframe is shown", async () => {
    jest.useFakeTimers();
    fillCard();
    tokenizeSucceeds();
    const finishVerify = verifyCardAfterLookup(true);

    const result = submit();
    await jest.advanceTimersByTimeAsync(0);
    emitThreeDS("authentication-iframe-available");
    await jest.advanceTimersByTimeAsync(CHALLENGE_SHOW_TIMEOUT_MS * 3);
    finishVerify({ status: "authenticate_successful", liabilityShifted: true });

    await expect(result).resolves.toBeUndefined();
    expect(mockCancelVerifyCard).not.toHaveBeenCalled();
    expect(mockHandleTransactionSale).toHaveBeenCalledWith("3ds-nonce", {
      deviceData: "device-data",
    });
  });

  it("pays a frictionless card without Songbird: no challenge requested, no timeout", async () => {
    jest.useFakeTimers();
    delete windowWithCardinal.Cardinal;
    fillCard();
    tokenizeSucceeds();
    const finishVerify = verifyCardAfterLookup(false);

    const result = submit();
    await jest.advanceTimersByTimeAsync(CHALLENGE_SHOW_TIMEOUT_MS * 3);
    finishVerify({ status: "authenticate_successful", liabilityShifted: true });

    await expect(result).resolves.toBeUndefined();
    expect(mockCancelVerifyCard).not.toHaveBeenCalled();
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it("removes its 3DS event handlers once verifyCard settles", async () => {
    fillCard();
    tokenizeSucceeds();
    verifyCardReturns({
      status: "authenticate_successful",
      liabilityShifted: true,
    });

    await submit();

    expect(mockThreeDSHandlers["lookup-complete"]?.size).toBe(0);
    expect(mockThreeDSHandlers["authentication-iframe-available"]?.size).toBe(
      0,
    );
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
