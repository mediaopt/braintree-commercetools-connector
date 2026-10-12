import {
  codedError,
  failSubmit,
  reportSaleFailure,
  reportSubmitError,
} from "./submitError";

describe("submitError", () => {
  const error = { code: "SOME_CODE", message: "Something failed." };
  const reporters = () => ({
    notify: jest.fn(),
    onError: jest.fn(),
    isLoading: jest.fn(),
  });

  it("codedError keeps the message and adds the code", () => {
    const coded = codedError(error.code, error.message);

    expect(coded).toBeInstanceOf(Error);
    expect(coded).toMatchObject(error);
  });

  it("reportSubmitError shows an error toast, reports to onError, stops the loader and returns a coded error", () => {
    const r = reporters();

    const reason = reportSubmitError(r, "Please try again.", error);

    expect(r.notify).toHaveBeenCalledWith("Error", "Please try again.");
    expect(r.onError).toHaveBeenCalledWith(error);
    expect(r.isLoading).toHaveBeenCalledWith(false);
    expect(reason).toBeInstanceOf(Error);
    expect(reason).toMatchObject(error);
  });

  it("reportSubmitError with isWarning only changes the toast: onError still hears of the failure", () => {
    const r = reporters();

    reportSubmitError(r, "Please use a different payment method.", error, true);

    expect(r.notify).toHaveBeenCalledWith(
      "Warning",
      "Please use a different payment method.",
    );
    expect(r.onError).toHaveBeenCalledWith(error);
  });

  it("failSubmit rejects with the given cause instead (onError is optional)", () => {
    const reject = jest.fn();
    const cause = new Error("original");

    failSubmit(
      { notify: jest.fn(), isLoading: jest.fn() },
      reject,
      "Please try again.",
      error,
      cause,
    );

    expect(reject).toHaveBeenCalledWith(cause);
  });

  it("reportSaleFailure reports a failed sale to onError and passes the same error on", async () => {
    const onError = jest.fn();
    const saleError = codedError(error.code, error.message);

    await expect(
      reportSaleFailure(Promise.reject(saleError), onError),
    ).rejects.toBe(saleError);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it("reportSaleFailure leaves a successful sale alone", async () => {
    const onError = jest.fn();

    await expect(
      reportSaleFailure(Promise.resolve("done"), onError),
    ).resolves.toBe("done");

    expect(onError).not.toHaveBeenCalled();
  });
});
