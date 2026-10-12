import { codedError, failSubmit } from "./submitError";

describe("submitError", () => {
  const error = { code: "SOME_CODE", message: "Something failed." };

  it("codedError keeps the message and adds the code", () => {
    const coded = codedError(error.code, error.message);

    expect(coded).toBeInstanceOf(Error);
    expect(coded).toMatchObject(error);
  });

  it("failSubmit shows the toast, reports to onError, stops the loader and rejects with a coded error", () => {
    const reporters = {
      notify: jest.fn(),
      onError: jest.fn(),
      isLoading: jest.fn(),
    };
    const reject = jest.fn();

    failSubmit(reporters, reject, "Please try again.", error);

    expect(reporters.notify).toHaveBeenCalledWith("Error", "Please try again.");
    expect(reporters.onError).toHaveBeenCalledWith(error);
    expect(reporters.isLoading).toHaveBeenCalledWith(false);
    const [reason] = reject.mock.calls[0];
    expect(reason).toBeInstanceOf(Error);
    expect(reason).toMatchObject(error);
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
});
