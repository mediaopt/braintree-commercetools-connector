import { act, render } from "@testing-library/react";

type Handler = (...args: any[]) => void;
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
const emitThreeDS = (event: string, ...args: unknown[]) =>
  mockThreeDSHandlers[event]?.forEach((handler) => handler(...args));
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

import { CreditCardMask } from "./CreditCardMask";
import { CHALLENGE_SHOW_TIMEOUT_MS, THREEDS_CONTAINER_ID } from "./constants";
import { isRetryBlocked } from "./threeDSVerifier";

const windowWithCardinal = window as { Cardinal?: unknown };

const tokenizeSucceeds = () =>
  mockTokenize.mockImplementation((_options, callback) =>
    callback(null, { nonce: "card-nonce", details: { bin: "411111" } }),
  );

const verifyCardReturns = (threeDSecureInfo: object) =>
  mockVerifyCard.mockResolvedValue({ nonce: "3ds-nonce", threeDSecureInfo });

// The retry block is per page (module state), so afterEach settles the last verifyCard it left
// pending and lets the grace period pass.
let settleLastVerify: ((threeDSecureInfo: object) => void) | undefined;

// verifyCard emits lookup-complete like the SDK, then settles only when the test calls the result.
const verifyCardAfterLookup = (requiresUserAuthentication: boolean) => {
  let resolve!: (value: unknown) => void;
  mockVerifyCard.mockImplementation(() => {
    emitThreeDS("lookup-complete", { requiresUserAuthentication });
    return new Promise((r) => {
      resolve = r;
    });
  });
  settleLastVerify = (threeDSecureInfo: object) =>
    resolve({ nonce: "3ds-nonce", threeDSecureInfo });
  return settleLastVerify;
};

const LIABILITY_SHIFTED = {
  status: "authenticate_successful",
  liabilityShifted: true,
};

const TIMEOUT_S = CHALLENGE_SHOW_TIMEOUT_MS / 1000;
const LATE_CHALLENGE_WARNING = `3D Secure challenge became available after the payment was already rejected (not shown within ${TIMEOUT_S} s); it was not displayed.`;
const STILL_LOADING = {
  code: "THREEDS_STILL_LOADING",
  message: "3D Secure is still loading. Please try again in a moment.",
};

describe("CreditCardMask — Checkout submit() and onError on 3D Secure and tokenize failures", () => {
  const mockOnError = jest.fn();
  let submit: (storePaymentDetails?: boolean) => Promise<void>;
  let unmountMask: () => void;

  const renderMask = () => {
    ({ unmount: unmountMask } = render(
      <CreditCardMask
        onRegisterSubmit={(registered) => {
          submit = registered;
        }}
        onError={mockOnError}
      />,
    ));
  };

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

    renderMask();
  });

  afterEach(async () => {
    if (isRetryBlocked()) {
      settleLastVerify!(LIABILITY_SHIFTED);
      await jest.advanceTimersByTimeAsync(CHALLENGE_SHOW_TIMEOUT_MS);
    }
    expect(isRetryBlocked()).toBe(false);
    settleLastVerify = undefined;
    jest.useRealTimers();
    delete windowWithCardinal.Cardinal;
    challengeContainer()?.remove();
    jest.restoreAllMocks();
  });

  const challengeContainer = () =>
    document.getElementById(THREEDS_CONTAINER_ID);

  // A requested challenge that isn't shown in time: submit() rejects, the SDK's verifyCard stays
  // pending until the returned function settles it (as the SDK does once Songbird is ready).
  const timeOutChallenge = async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation();
    fillCard();
    tokenizeSucceeds();
    const finishVerify = verifyCardAfterLookup(true);
    const first = submit().catch(() => {});
    await jest.advanceTimersByTimeAsync(CHALLENGE_SHOW_TIMEOUT_MS);
    await first;
    return finishVerify;
  };

  // A retry's own challenge: shown and paid.
  const retryWithChallenge = async () => {
    const finishVerify = verifyCardAfterLookup(true);
    const result = submit();
    await jest.advanceTimersByTimeAsync(0);
    const element = document.createElement("iframe");
    emitThreeDS("authentication-iframe-available", { element }, jest.fn());
    finishVerify(LIABILITY_SHIFTED);
    await expect(result).resolves.toBeUndefined();
    expect(challengeContainer()?.contains(element)).toBe(true);
    expect(mockHandleTransactionSale).toHaveBeenCalledTimes(1);
  };

  const expectRetryRefused = () =>
    expect(submit()).rejects.toMatchObject(STILL_LOADING);

  it.each([
    {
      songbird: "missing",
      code: "THREEDS_SONGBIRD_NOT_LOADED",
      message: `3D Secure challenge was not shown within ${TIMEOUT_S} s: Cardinal's Songbird.js (3D Secure) was not loaded. If you are the domain owner, please whitelist the hosts listed in https://braintree.github.io/braintree-web/current/#content-security-policy.`,
    },
    {
      songbird: "present",
      code: "THREEDS_CHALLENGE_NOT_SHOWN",
      message: `3D Secure challenge was not shown within ${TIMEOUT_S} s.`,
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
      // The developer is pointed at the network tab for a challenge too late to be logged.
      const [logged] = consoleError.mock.calls[0];
      expect(logged).toContain(message);
      expect(logged).toContain("browser's network tab");
    },
  );

  it.each([1, 2])(
    "keeps waiting for the shopper once the challenge iframe is shown (lookup-complete fired %i×)",
    async (lookups) => {
      jest.useFakeTimers();
      fillCard();
      tokenizeSucceeds();
      const finishVerify = verifyCardAfterLookup(true);

      const result = submit();
      await jest.advanceTimersByTimeAsync(0);
      for (let i = 1; i < lookups; i++) {
        emitThreeDS("lookup-complete", { requiresUserAuthentication: true });
      }
      const element = document.createElement("iframe");
      const next = jest.fn();
      emitThreeDS("authentication-iframe-available", { element }, next);
      await jest.advanceTimersByTimeAsync(CHALLENGE_SHOW_TIMEOUT_MS * 3);
      finishVerify(LIABILITY_SHIFTED);

      await expect(result).resolves.toBeUndefined();
      expect(challengeContainer()?.contains(element)).toBe(true);
      expect(next).toHaveBeenCalled();
      expect(mockCancelVerifyCard).not.toHaveBeenCalled();
      expect(mockHandleTransactionSale).toHaveBeenCalledWith("3ds-nonce", {
        deviceData: "device-data",
      });

      emitThreeDS("authentication-modal-close");
      expect(challengeContainer()).toBeNull();
    },
  );

  it("never mounts a challenge that a slow Songbird presents after the timeout, only warns", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
    await timeOutChallenge();

    const next = jest.fn();
    emitThreeDS(
      "authentication-iframe-available",
      { element: document.createElement("iframe") },
      next,
    );

    expect(challengeContainer()).toBeNull();
    expect(next).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(LATE_CHALLENGE_WARNING);
    expect(mockThreeDSHandlers["authentication-iframe-available"]?.size).toBe(
      0,
    );
  });

  it("refuses a retry without tokenizing while the timed-out verification hasn't settled", async () => {
    await timeOutChallenge();

    await expectRetryRefused();

    expect(mockTokenize).toHaveBeenCalledTimes(1);
    expect(mockVerifyCard).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenLastCalledWith("Error", STILL_LOADING.message);
    expect(mockOnError).toHaveBeenLastCalledWith(STILL_LOADING);
  });

  it("blocks retries after the SDK settles until the late challenge arrives", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
    const finishStale = await timeOutChallenge();
    // Songbird is ready: the SDK settles first, Cardinal still fetches the challenge.
    finishStale(LIABILITY_SHIFTED);
    await jest.advanceTimersByTimeAsync(0);

    await expectRetryRefused();

    emitThreeDS(
      "authentication-iframe-available",
      { element: document.createElement("iframe") },
      jest.fn(),
    );
    expect(challengeContainer()).toBeNull();
    expect(consoleWarn).toHaveBeenCalledWith(LATE_CHALLENGE_WARNING);

    await retryWithChallenge();
  });

  it("unblocks retries and stops watching for the late challenge after the grace period", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
    const finishStale = await timeOutChallenge();
    finishStale(LIABILITY_SHIFTED);
    await jest.advanceTimersByTimeAsync(CHALLENGE_SHOW_TIMEOUT_MS - 1);
    expect(isRetryBlocked()).toBe(true);
    await jest.advanceTimersByTimeAsync(1);

    expect(mockThreeDSHandlers["authentication-iframe-available"]?.size).toBe(
      0,
    );
    await retryWithChallenge();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("blocks retries across a card form remount (per page, like Cardinal)", async () => {
    await timeOutChallenge();
    unmountMask();
    renderMask();
    fillCard();

    await expectRetryRefused();
  });

  it("pays a frictionless card without Songbird: no challenge requested, no timeout", async () => {
    jest.useFakeTimers();
    delete windowWithCardinal.Cardinal;
    fillCard();
    tokenizeSucceeds();
    const finishVerify = verifyCardAfterLookup(false);

    const result = submit();
    await jest.advanceTimersByTimeAsync(CHALLENGE_SHOW_TIMEOUT_MS * 3);
    finishVerify(LIABILITY_SHIFTED);

    await expect(result).resolves.toBeUndefined();
    expect(mockCancelVerifyCard).not.toHaveBeenCalled();
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it("removes its 3DS event handlers once verifyCard settles", async () => {
    fillCard();
    tokenizeSucceeds();
    verifyCardReturns(LIABILITY_SHIFTED);

    await submit();

    expect(mockThreeDSHandlers["lookup-complete"]?.size).toBe(0);
    expect(mockThreeDSHandlers["authentication-iframe-available"]?.size).toBe(
      0,
    );
  });

  it("runs transactionSale with the 3DS nonce when liability shifted", async () => {
    fillCard();
    tokenizeSucceeds();
    verifyCardReturns(LIABILITY_SHIFTED);

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

    await expect(submit()).rejects.toMatchObject({
      code: "3DS_AUTHENTICATION_FAILED",
      message: "Could not authenticate: authenticate_rejected",
    });

    expect(mockHandleTransactionSale).not.toHaveBeenCalled();
    expect(mockIsLoading).toHaveBeenLastCalledWith(false);
    expect(mockNotify).toHaveBeenCalledWith("Error", "Could not authenticate");
    expect(mockOnError).toHaveBeenCalledWith({
      code: "3DS_AUTHENTICATION_FAILED",
      message: "Could not authenticate: authenticate_rejected",
    });
  });

  it.each([
    {
      threeDSecureInfo: {
        status: "authenticate_successful",
        liabilityShiftPossible: true,
      },
      code: "3DS_LIABILITY_SHIFT_NOT_ACHIEVED",
      message: "3D Secure liability shift not achieved",
      toast:
        "Failed the 3D Secure verification. Please use a different payment method.",
    },
    {
      threeDSecureInfo: { status: "authenticate_successful" },
      code: "3DS_NOT_AVAILABLE",
      message: "3D Secure not available for this card",
      toast:
        "3D Secure is not available for your card. Please use a different payment method.",
    },
  ])(
    "rejects and reports $code with a warning toast when liability doesn't shift",
    async ({ threeDSecureInfo, code, message, toast }) => {
      fillCard();
      tokenizeSucceeds();
      verifyCardReturns(threeDSecureInfo);

      await expect(submit()).rejects.toMatchObject({ code, message });

      expect(mockHandleTransactionSale).not.toHaveBeenCalled();
      expect(mockIsLoading).toHaveBeenLastCalledWith(false);
      expect(mockNotify).toHaveBeenCalledWith("Warning", toast);
      expect(mockOnError).toHaveBeenCalledWith({ code, message });
    },
  );

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
