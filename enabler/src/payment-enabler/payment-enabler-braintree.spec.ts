import { BraintreePaymentEnabler } from "./payment-enabler-braintree";

const mockFetchOk = (json: Record<string, unknown>) => {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => json,
  });
};

const buildEnabler = (overrides: Record<string, unknown> = {}) =>
  new BraintreePaymentEnabler({
    processorUrl: "https://processor.example",
    sessionId: "session-id",
    ...overrides,
  } as any);

describe("BraintreePaymentEnabler", () => {
  const savedFetch = global.fetch;

  beforeEach(() => {
    mockFetchOk({ merchantAccountId: "merchant-account" });
  });

  afterEach(() => {
    global.fetch = savedFetch;
  });

  it("passes Checkout's onError to every component through baseOptions", async () => {
    const onError = jest.fn();

    const enabler = buildEnabler({ onError });

    expect((await enabler.setupData).baseOptions.onError).toBe(onError);
  });
});
