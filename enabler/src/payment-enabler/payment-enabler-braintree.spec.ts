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

  describe("one payment shared by every standard/stored component", () => {
    const sharedPayment = {
      braintreeData: { clientToken: "token", braintreeCustomerId: "" },
      payment: {
        ctPaymentId: "payment-1",
        braintreeAmount: 10,
        currency: "USD",
      },
    };
    let createPaymentResponses: unknown[];

    const createPaymentCalls = () =>
      (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) => url === "https://processor.example/payments",
      );

    beforeEach(() => {
      createPaymentResponses = [sharedPayment];
      (global as any).fetch = jest.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          url.endsWith("/operations/config")
            ? {}
            : createPaymentResponses.shift(),
      }));
    });

    it("creates it once, without a payment method type, for all standard and stored builders", async () => {
      const enabler = buildEnabler();

      await enabler.createComponentBuilder("card");
      await enabler.createComponentBuilder("paypal");
      await enabler.createStoredPaymentMethodBuilder("card");

      expect(createPaymentCalls()).toHaveLength(1);
      expect(JSON.parse(createPaymentCalls()[0][1].body)).toEqual({});
    });

    it("is not created for an unsupported stored payment method type", async () => {
      const enabler = buildEnabler();

      await expect(
        enabler.createStoredPaymentMethodBuilder("paypal"),
      ).rejects.toThrow("Unsupported stored payment method type: paypal");

      expect(createPaymentCalls()).toHaveLength(0);
    });

    it("is not created for Express", async () => {
      await buildEnabler().createExpressBuilder("paypal");

      expect(createPaymentCalls()).toHaveLength(0);
    });

    it("rejects the builder when creation fails, and the next builder retries", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      createPaymentResponses = [undefined, sharedPayment];
      const enabler = buildEnabler();

      await expect(enabler.createComponentBuilder("card")).rejects.toThrow(
        "Could not create payment",
      );
      await enabler.createComponentBuilder("card");

      expect(createPaymentCalls()).toHaveLength(2);
      warn.mockRestore();
    });
  });

  describe("local payment methods depend on the processor's hasMerchantAccount", () => {
    const isAvailable = async (type: string) =>
      (await buildEnabler().createComponentBuilder(type)).build({})
        .isAvailable!();

    beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
    afterEach(() => jest.restoreAllMocks());

    it("are unavailable without a merchant account", async () => {
      mockFetchOk({ hasMerchantAccount: false });

      expect(await isAvailable("ideal")).toBe(false);
      expect(await isAvailable("card")).toBe(true);
    });

    it("are available with a merchant account", async () => {
      mockFetchOk({ hasMerchantAccount: true });

      expect(await isAvailable("ideal")).toBe(true);
    });
  });
});
