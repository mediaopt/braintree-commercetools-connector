import { processorRequest } from "./processorRequest";

const URL = "https://processor.example/payments";

// Answers every request with the given status and JSON body
const mockFetch = (status: number, body: unknown) => {
  (global as any).fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
};

describe("processorRequest", () => {
  const savedFetch = global.fetch;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = savedFetch;
    warn.mockRestore();
  });

  it("answers the processor's body", async () => {
    mockFetch(200, { success: true });

    await expect(processorRequest({}, URL, {})).resolves.toEqual({
      success: true,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("answers undefined for a refusal, never its error body", async () => {
    mockFetch(401, { message: "Session is not active", statusCode: 401 });

    await expect(processorRequest({}, URL, {})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`Processor request to ${URL} failed.`);
  });

  it("answers undefined for an unreachable processor", async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(processorRequest({}, URL, {})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
