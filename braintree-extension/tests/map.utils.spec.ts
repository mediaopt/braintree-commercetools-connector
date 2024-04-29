import {
  mapCommercetoolsMoneyToBraintreeMoney,
  mapBraintreeMoneyToCommercetoolsMoney,
} from '../src/utils/map.utils';
import { TypedMoney } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/common';
import { expect } from '@jest/globals';

describe('test map utilities', () => {
  test.each([
    {
      commercetoolsMoney: {
        centAmount: 1,
        fractionDigits: 2,
      } as TypedMoney,
      expectedBraintreeAmount: '0.01',
    },
    {
      commercetoolsMoney: {
        centAmount: 6532,
        fractionDigits: 2,
      } as TypedMoney,
      expectedBraintreeAmount: '65.32',
    },
    {
      commercetoolsMoney: {
        centAmount: 3097,
        fractionDigits: 2,
      } as TypedMoney,
      expectedBraintreeAmount: '30.97',
    },
    {
      commercetoolsMoney: {
        centAmount: 1,
        fractionDigits: 3,
      } as TypedMoney,
      expectedBraintreeAmount: '0.001',
    },
    {
      commercetoolsMoney: {
        centAmount: 6532,
        fractionDigits: 4,
      } as TypedMoney,
      expectedBraintreeAmount: '0.6532',
    },
    {
      commercetoolsMoney: {
        centAmount: 3097,
        fractionDigits: 1,
      } as TypedMoney,
      expectedBraintreeAmount: '309.7',
    },
  ])(
    'test mapping of commercetools amount to braintree amount and vise versa',
    ({ commercetoolsMoney, expectedBraintreeAmount }) => {
      expect(mapCommercetoolsMoneyToBraintreeMoney(commercetoolsMoney)).toBe(
        expectedBraintreeAmount
      );
      expect(
        mapBraintreeMoneyToCommercetoolsMoney(
          expectedBraintreeAmount,
          commercetoolsMoney.fractionDigits
        )
      ).toBe(commercetoolsMoney.centAmount);
    }
  );
});
