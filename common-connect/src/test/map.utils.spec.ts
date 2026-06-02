import { TypedMoney } from "@commercetools/platform-sdk/dist/declarations/src/generated/models/common";
import { expect } from "@jest/globals";
import {
  mapBraintreeMoneyToCommercetoolsMoney,
  mapCommercetoolsMoneyToBraintreeMoney,
  mapBraintreeStatusToCommercetoolsTransactionType,
  mapBraintreeStatusToCommercetoolsTransactionState,
  getPaymentMethodHint,
  mapRequestToBraintreeTransactionSale,
  mapBraintreeTransactionToCommercetoolsTransaction,
  mapCTCustomerToNewBraintreeCustomer,
} from "../index";

type MoneyTestData = {
  commercetoolsMoney: Pick<TypedMoney, "centAmount" | "fractionDigits">;
  expectedBraintreeAmount: string;
};

const testData: MoneyTestData[] = [
  {
    commercetoolsMoney: {
      centAmount: 1,
      fractionDigits: 2,
    },
    expectedBraintreeAmount: "0.01",
  },
  {
    commercetoolsMoney: {
      centAmount: 6532,
      fractionDigits: 2,
    },
    expectedBraintreeAmount: "65.32",
  },
  {
    commercetoolsMoney: {
      centAmount: 3097,
      fractionDigits: 2,
    },
    expectedBraintreeAmount: "30.97",
  },
  {
    commercetoolsMoney: {
      centAmount: 1,
      fractionDigits: 3,
    },
    expectedBraintreeAmount: "0.001",
  },
  {
    commercetoolsMoney: {
      centAmount: 6532,
      fractionDigits: 4,
    },
    expectedBraintreeAmount: "0.6532",
  },
  {
    commercetoolsMoney: {
      centAmount: 3097,
      fractionDigits: 1,
    },
    expectedBraintreeAmount: "309.7",
  },
];

const basePayment: any = {
  amountPlanned: { centAmount: 1000, fractionDigits: 2, currencyCode: "EUR" },
  transactions: [],
};

describe("mapBraintreeStatusToCommercetoolsTransactionType", () => {
  test.each([
    ["authorized", "Authorization"],
    ["authorizing", "Authorization"],
    ["voided", "CancelAuthorization"],
    ["settled", "Charge"],
    ["settling", "Charge"],
    ["settlement_confirmed", "Charge"],
    ["settlement_pending", "Charge"],
    ["submitted_for_settlement", "Charge"],
    ["unknown_status", "Charge"],
  ])("maps '%s' → '%s'", (status, expected) => {
    expect(mapBraintreeStatusToCommercetoolsTransactionType(status as any)).toBe(expected);
  });
});

describe("mapBraintreeStatusToCommercetoolsTransactionState", () => {
  test.each([
    ["authorized", "Success"],
    ["settled", "Success"],
    ["voided", "Success"],
    ["settlement_confirmed", "Success"],
    ["authorization_expired", "Failure"],
    ["gateway_rejected", "Failure"],
    ["failed", "Failure"],
    ["settlement_declined", "Failure"],
    ["processor_declined", "Failure"],
    ["unknown_status", "Pending"],
  ])("maps '%s' → '%s'", (status, expected) => {
    expect(mapBraintreeStatusToCommercetoolsTransactionState(status as any)).toBe(expected);
  });
});

describe("getPaymentMethodHint", () => {
  test.each([
    ["credit_card",                 "credit_card",    { creditCard: { cardType: "Visa", maskedNumber: "411111******1111" } }, "Visa 411111******1111"],
    ["paypal_account with email",   "paypal_account", { paypalAccount: { payerEmail: "buyer@example.com" } },                "buyer@example.com"],
    ["paypal_account without email","paypal_account", { paypalAccount: {} },                                                 ""],
    ["venmo_account",               "venmo_account",  { venmoAccount: { username: "venmo-user" } },                          "venmo-user"],
    ["android_pay_card",            "android_pay_card",{ androidPayCard: { sourceDescription: "Android Pay Visa" } },        "Android Pay Visa"],
    ["apple_pay_card",              "apple_pay_card", { applePayCard: { sourceDescription: "Apple Pay Mastercard" } },       "Apple Pay Mastercard"],
    ["unknown_type",                "unknown_type",   {},                                                                     ""],
  ])("returns correct hint for %s", (_, paymentInstrumentType, fields, expected) => {
    expect(getPaymentMethodHint({ paymentInstrumentType, ...fields } as any)).toBe(expected);
  });
});

describe("mapRequestToBraintreeTransactionSale", () => {
  const payment: any = {
    ...basePayment,
    custom: { fields: { BraintreeOrderId: "order-1" } },
  };

  test("builds base request shape", () => {
    const result = mapRequestToBraintreeTransactionSale(payment);
    expect(result).toMatchObject({
      amount: "10.00",
      channel: "commercetoolsGmbH_SP_BT",
      orderId: "order-1",
      options: { submitForSettlement: false, storeInVaultOnSuccess: false },
    });
  });

  test("sets storeShippingAddressInVault when both vault and shipping flags are true", () => {
    const result = mapRequestToBraintreeTransactionSale(payment, true, true);
    expect(result.options?.storeInVaultOnSuccess).toBe(true);
    expect(result.options?.storeShippingAddressInVault).toBe(true);
  });

  test("does not set storeShippingAddressInVault when storeShipping is false", () => {
    const result = mapRequestToBraintreeTransactionSale(payment, true, false);
    expect(result.options?.storeShippingAddressInVault).toBe(false);
  });

  test("sets submitForSettlement when BRAINTREE_AUTOCAPTURE is true", () => {
    process.env.BRAINTREE_AUTOCAPTURE = "true";
    try {
      const result = mapRequestToBraintreeTransactionSale(payment);
      expect(result.options?.submitForSettlement).toBe(true);
    } finally {
      delete process.env.BRAINTREE_AUTOCAPTURE;
    }
  });

  test("sets merchantAccountId from BRAINTREE_MERCHANT_ACCOUNT", () => {
    process.env.BRAINTREE_MERCHANT_ACCOUNT = "sub-merchant";
    try {
      const result = mapRequestToBraintreeTransactionSale(payment);
      expect(result.merchantAccountId).toBe("sub-merchant");
    } finally {
      delete process.env.BRAINTREE_MERCHANT_ACCOUNT;
    }
  });

  test("optionalRequestData is spread into result", () => {
    const result = mapRequestToBraintreeTransactionSale(
      payment, false, false, undefined, undefined,
      { deviceData: "device-123" } as any,
    );
    expect((result as any).deviceData).toBe("device-123");
  });

  test("passes paymentMethodNonce and paymentMethodToken", () => {
    const result = mapRequestToBraintreeTransactionSale(
      payment, false, false, "nonce-abc", "token-xyz",
    );
    expect(result.paymentMethodNonce).toBe("nonce-abc");
    expect(result.paymentMethodToken).toBe("token-xyz");
  });
});

describe("mapBraintreeTransactionToCommercetoolsTransaction", () => {
  test("uses 'Refund' type when response.type is 'credit'", () => {
    const response: any = {
      type: "credit",
      status: "settled",
      id: "txn-1",
      amount: "10.00",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const result = mapBraintreeTransactionToCommercetoolsTransaction(basePayment, response);
    expect(result.type).toBe("Refund");
  });

  test("returns existing transaction with updated state and timestamp when match found", () => {
    const existing = {
      id: "ct-txn-1",
      interactionId: "txn-1",
      type: "Charge",
      amount: { centAmount: 1000, currencyCode: "EUR" },
      state: "Pending",
    };
    const payment: any = { ...basePayment, transactions: [existing] };
    const response: any = {
      type: "sale",
      status: "settled",
      id: "txn-1",
      amount: "10.00",
      updatedAt: "2024-06-01T00:00:00Z",
    };
    const result = mapBraintreeTransactionToCommercetoolsTransaction(payment, response);
    expect(result).toMatchObject({
      ...existing,
      state: "Success",
      timestamp: "2024-06-01T00:00:00Z",
    });
  });

  test("returns new transaction data when no matching CT transaction found", () => {
    const response: any = {
      type: "sale",
      status: "authorized",
      id: "txn-new",
      amount: "10.00",
      updatedAt: "2024-06-01T00:00:00Z",
    };
    const result = mapBraintreeTransactionToCommercetoolsTransaction(basePayment, response);
    expect(result).toMatchObject({
      type: "Authorization",
      interactionId: "txn-new",
      state: "Success",
      timestamp: "2024-06-01T00:00:00Z",
      amount: { centAmount: 1000, currencyCode: "EUR" },
    });
  });
});

describe("mapCTCustomerToNewBraintreeCustomer", () => {
  test("maps CT customer fields to Braintree customer shape", () => {
    const ctCustomer: any = {
      id: "cust-1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      companyName: "Acme",
    };
    expect(mapCTCustomerToNewBraintreeCustomer(ctCustomer)).toEqual({
      id: "cust-1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      company: "Acme",
    });
  });
});

describe("test map utilities", () => {
  test.each(testData)(
    "test mapping of commercetools amount to braintree amount and vise versa",
    ({ commercetoolsMoney, expectedBraintreeAmount }) => {
      expect(
        mapCommercetoolsMoneyToBraintreeMoney(commercetoolsMoney as TypedMoney),
      ).toBe(expectedBraintreeAmount);
      expect(
        mapBraintreeMoneyToCommercetoolsMoney(
          expectedBraintreeAmount,
          commercetoolsMoney.fractionDigits,
        ),
      ).toBe(commercetoolsMoney.centAmount);
    },
  );
});
