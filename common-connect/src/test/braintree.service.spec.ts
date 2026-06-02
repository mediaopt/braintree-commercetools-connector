import { EventEmitter } from "events";
import { BraintreeGateway, Environment } from "braintree";
import {
  getBraintreeGateway,
  getClientToken,
  transactionSale,
  refund,
  voidTransaction,
  addPackageTracking,
  submitForSettlement,
  findCustomer,
  createCustomer,
  createPaymentMethod,
  deleteCustomer,
  findTransaction,
  deletePayment,
  updatePayment,
} from "../service/braintree.service";
import { CustomError } from "..";

jest.mock("braintree", () => {
  const actual = jest.requireActual("braintree");
  return {
    ...actual,
    BraintreeGateway: jest.fn(),
  };
});

const MockBraintreeGateway = BraintreeGateway as jest.MockedClass<
  typeof BraintreeGateway
>;

beforeAll(() => {
  process.env.BRAINTREE_MERCHANT_ID = "test-merchant";
  process.env.BRAINTREE_PUBLIC_KEY = "test-public";
  process.env.BRAINTREE_PRIVATE_KEY = "test-private";
});

let mockGatewayInstance: Record<string, any>;

beforeEach(() => {
  mockGatewayInstance = {
    config: {},
    clientToken: { generate: jest.fn() },
    transaction: {
      sale: jest.fn(),
      refund: jest.fn(),
      void: jest.fn(),
      submitForSettlement: jest.fn(),
      submitForPartialSettlement: jest.fn(),
      search: jest.fn(),
      packageTracking: jest.fn(),
    },
    customer: {
      find: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    paymentMethod: {
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  };
  MockBraintreeGateway.mockClear();
  MockBraintreeGateway.mockImplementation(
    () => mockGatewayInstance as any,
  );
});

describe("getBraintreeGateway", () => {
  test("creates gateway with credentials from env vars", () => {
    getBraintreeGateway();
    expect(MockBraintreeGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: "test-merchant",
        publicKey: "test-public",
        privateKey: "test-private",
      }),
    );
  });

  test("uses Sandbox environment by default", () => {
    getBraintreeGateway();
    expect(MockBraintreeGateway).toHaveBeenCalledWith(
      expect.objectContaining({ environment: Environment.Sandbox }),
    );
  });

  test("uses Production environment when BRAINTREE_ENVIRONMENT is Production", () => {
    process.env.BRAINTREE_ENVIRONMENT = "Production";
    try {
      getBraintreeGateway();
      expect(MockBraintreeGateway).toHaveBeenCalledWith(
        expect.objectContaining({ environment: Environment.Production }),
      );
    } finally {
      delete process.env.BRAINTREE_ENVIRONMENT;
    }
  });

  test("sets default timeout of 9500", () => {
    getBraintreeGateway();
    expect(mockGatewayInstance.config.timeout).toBe(9500);
  });

  test("sets custom timeout when provided", () => {
    getBraintreeGateway(1500);
    expect(mockGatewayInstance.config.timeout).toBe(1500);
  });

  describe("missing config", () => {
    afterEach(() => {
      process.env.BRAINTREE_MERCHANT_ID = "test-merchant";
    });

    test("throws CustomError when credentials are missing", () => {
      delete process.env.BRAINTREE_MERCHANT_ID;
      expect(() => getBraintreeGateway()).toThrow(CustomError);
    });
  });
});

describe("getClientToken", () => {
  test("returns clientToken on success", async () => {
    mockGatewayInstance.clientToken.generate.mockResolvedValue({
      success: true,
      clientToken: "token-abc",
    });
    const result = await getClientToken({});
    expect(result).toBe("token-abc");
  });

  test("throws CustomError on failure", async () => {
    mockGatewayInstance.clientToken.generate.mockResolvedValue({
      success: false,
      message: "Unauthorized",
    });
    await expect(getClientToken({})).rejects.toMatchObject({
      statusCode: 500,
      message: "Unauthorized",
    });
  });
});

describe("transactionSale", () => {
  test("returns transaction on success", async () => {
    const mockTransaction = { id: "txn-1", status: "authorized" };
    mockGatewayInstance.transaction.sale.mockResolvedValue({
      success: true,
      transaction: mockTransaction,
    });
    const result = await transactionSale({ amount: "10.00" } as any);
    expect(result).toBe(mockTransaction);
  });

  test.each([
    ["soft_declined", "Insufficient funds", "[soft_declined] Insufficient funds"],
    ["hard_declined", "Card blocked", "[hard_declined] Card blocked"],
    ["approved", "Gateway error", "Gateway error"],
  ])(
    "throws CustomError with correct prefix for processorResponseType '%s'",
    async (processorResponseType, message, expectedMessage) => {
      mockGatewayInstance.transaction.sale.mockResolvedValue({
        success: false,
        message,
        transaction: { processorResponseType },
      });
      await expect(transactionSale({ amount: "10.00" } as any)).rejects.toMatchObject({
        statusCode: 500,
        message: expectedMessage,
      });
    },
  );
});

describe("refund", () => {
  test("returns transaction on success", async () => {
    const mockTransaction = { id: "txn-1", status: "settled" };
    mockGatewayInstance.transaction.refund.mockResolvedValue({
      success: true,
      transaction: mockTransaction,
    });
    const result = await refund("txn-1", "5.00");
    expect(result).toBe(mockTransaction);
  });

  test("throws CustomError on failure", async () => {
    mockGatewayInstance.transaction.refund.mockResolvedValue({
      success: false,
      message: "Cannot refund",
    });
    await expect(refund("txn-1")).rejects.toMatchObject({
      statusCode: 500,
      message: "Cannot refund",
    });
  });
});

describe("voidTransaction", () => {
  test("returns transaction on success", async () => {
    const mockTransaction = { id: "txn-1", status: "voided" };
    mockGatewayInstance.transaction.void.mockResolvedValue({
      success: true,
      transaction: mockTransaction,
    });
    const result = await voidTransaction("txn-1");
    expect(result).toBe(mockTransaction);
  });

  test("throws CustomError on failure", async () => {
    mockGatewayInstance.transaction.void.mockResolvedValue({
      success: false,
      message: "Cannot void",
    });
    await expect(voidTransaction("txn-1")).rejects.toMatchObject({
      statusCode: 500,
      message: "Cannot void",
    });
  });
});

describe("addPackageTracking", () => {
  const packageParam = { carrier: "UPS", trackingNumber: "1Z999" };

  test("returns transaction on success", async () => {
    const mockTransaction = { id: "txn-1" };
    mockGatewayInstance.transaction.packageTracking.mockResolvedValue({
      success: true,
      transaction: mockTransaction,
    });
    const result = await addPackageTracking("txn-1", packageParam);
    expect(result).toBe(mockTransaction);
  });

  test("throws CustomError on failure", async () => {
    mockGatewayInstance.transaction.packageTracking.mockResolvedValue({
      success: false,
      message: "Tracking error",
    });
    await expect(addPackageTracking("txn-1", packageParam)).rejects.toMatchObject({
      statusCode: 500,
      message: "Tracking error",
    });
  });
});

describe("submitForSettlement", () => {
  test("calls submitForPartialSettlement when amount is provided", async () => {
    const mockTransaction = { id: "txn-1" };
    mockGatewayInstance.transaction.submitForPartialSettlement.mockResolvedValue({
      success: true,
      transaction: mockTransaction,
    });
    const result = await submitForSettlement("txn-1", "5.00");
    expect(mockGatewayInstance.transaction.submitForPartialSettlement).toHaveBeenCalledWith("txn-1", "5.00");
    expect(result).toBe(mockTransaction);
  });

  test("calls submitForSettlement when amount is not provided", async () => {
    const mockTransaction = { id: "txn-1" };
    mockGatewayInstance.transaction.submitForSettlement.mockResolvedValue({
      success: true,
      transaction: mockTransaction,
    });
    const result = await submitForSettlement("txn-1");
    expect(mockGatewayInstance.transaction.submitForSettlement).toHaveBeenCalledWith("txn-1");
    expect(result).toBe(mockTransaction);
  });

  test("throws CustomError on failure", async () => {
    mockGatewayInstance.transaction.submitForSettlement.mockResolvedValue({
      success: false,
      message: "Settlement failed",
    });
    await expect(submitForSettlement("txn-1")).rejects.toMatchObject({
      statusCode: 500,
      message: "Settlement failed",
    });
  });
});

describe("findCustomer", () => {
  test("returns customer from gateway", async () => {
    const mockCustomer = { id: "cust-1" };
    mockGatewayInstance.customer.find.mockResolvedValue(mockCustomer);
    const result = await findCustomer("cust-1");
    expect(result).toBe(mockCustomer);
  });
});

describe("createCustomer", () => {
  test("returns customer on success", async () => {
    const mockCustomer = { id: "cust-1" };
    mockGatewayInstance.customer.create.mockResolvedValue({
      success: true,
      customer: mockCustomer,
    });
    const result = await createCustomer({ firstName: "Jane" });
    expect(result).toBe(mockCustomer);
  });

  test("throws CustomError on failure", async () => {
    mockGatewayInstance.customer.create.mockResolvedValue({
      success: false,
      message: "Invalid customer",
    });
    await expect(createCustomer({ firstName: "Jane" })).rejects.toMatchObject({
      statusCode: 500,
      message: "Invalid customer",
    });
  });
});

describe("createPaymentMethod", () => {
  test("returns paymentMethod on success", async () => {
    const mockMethod = { token: "tok-1" };
    mockGatewayInstance.paymentMethod.create.mockResolvedValue({
      success: true,
      paymentMethod: mockMethod,
    });
    const result = await createPaymentMethod({ customerId: "cust-1", paymentMethodNonce: "nonce" });
    expect(result).toBe(mockMethod);
  });

  test("throws CustomError on failure", async () => {
    mockGatewayInstance.paymentMethod.create.mockResolvedValue({
      success: false,
      message: "Invalid nonce",
    });
    await expect(
      createPaymentMethod({ customerId: "cust-1", paymentMethodNonce: "nonce" }),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Invalid nonce",
    });
  });
});

describe("deleteCustomer", () => {
  test("calls gateway.customer.delete with the given id", async () => {
    await deleteCustomer("cust-1");
    expect(mockGatewayInstance.customer.delete).toHaveBeenCalledWith("cust-1");
  });
});

describe("findTransaction", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    mockGatewayInstance.transaction.search.mockReturnValue(emitter);
  });

  test("returns transactions emitted by the stream", async () => {
    const promise = findTransaction("order-1");
    emitter.emit("data", { id: "txn-1" });
    emitter.emit("end");
    expect(await promise).toEqual([{ id: "txn-1" }]);
  });

  test("throws CustomError when no transactions are found", async () => {
    const promise = findTransaction("order-1");
    emitter.emit("end");
    await expect(promise).rejects.toMatchObject({
      statusCode: 500,
      message: "could not find transaction with orderId order-1",
    });
  });

  test("rejects when stream emits an error", async () => {
    const promise = findTransaction("order-1");
    emitter.emit("error", new Error("stream failure"));
    await expect(promise).rejects.toThrow("stream failure");
  });
});

describe("deletePayment", () => {
  test("calls gateway.paymentMethod.delete with the given token", async () => {
    await deletePayment("tok-1");
    expect(mockGatewayInstance.paymentMethod.delete).toHaveBeenCalledWith("tok-1");
  });
});

describe("updatePayment", () => {
  test("returns paymentMethod on success", async () => {
    const mockMethod = { token: "tok-1" };
    mockGatewayInstance.paymentMethod.update.mockResolvedValue({
      success: true,
      paymentMethod: mockMethod,
    });
    const result = await updatePayment("tok-1", { cardholderName: "Jane" });
    expect(result).toBe(mockMethod);
  });

  test("throws CustomError on failure", async () => {
    mockGatewayInstance.paymentMethod.update.mockResolvedValue({
      success: false,
      message: "Update failed",
    });
    await expect(updatePayment("tok-1", {})).rejects.toMatchObject({
      statusCode: 500,
      message: "Update failed",
    });
  });
});

