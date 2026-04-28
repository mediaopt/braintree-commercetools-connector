import { TypedMoney } from "@commercetools/platform-sdk/dist/declarations/src/generated/models/common";
import { expect } from "@jest/globals";
import {
  mapBraintreeMoneyToCommercetoolsMoney,
  mapCommercetoolsMoneyToBraintreeMoney,
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
