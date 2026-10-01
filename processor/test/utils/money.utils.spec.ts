import { describe, test, expect } from '@jest/globals';
import { relevantDiscountAmount, relevantShippingAmount, toNum } from '../../src/utils/money.utils';
import { CentPrecisionMoney, DiscountOnTotalPrice, ShippingInfo, TypedMoney } from '@commercetools/platform-sdk';

describe('money.utils', () => {
  describe('toNum', () => {
    test('returns 0 for undefined money', () => {
      expect(toNum(undefined)).toBe(0);
    });

    test('converts money to number', () => {
      const money: TypedMoney = {
        type: 'centPrecision',
        currencyCode: 'USD',
        centAmount: 10000,
        fractionDigits: 2,
      };
      expect(toNum(money)).toBe(100);
    });
  });

  const usd = (centAmount: number): CentPrecisionMoney => ({
    type: 'centPrecision',
    currencyCode: 'USD',
    centAmount,
    fractionDigits: 2,
  });
  const taxed = (gross: number) => ({ totalNet: usd(0), totalGross: usd(gross), totalTax: usd(0), taxPortions: [] });

  const discounted = (centAmount: number) => ({ value: usd(centAmount), includedDiscounts: [] });

  test.each([
    {
      description: 'uses the gross when the shipping is taxed, even if it is discounted',
      props: { taxedPrice: taxed(595), discountedPrice: discounted(500) },
      expected: 595,
    },
    {
      description: 'falls back to the discounted price without taxedPrice, also when it is 0',
      props: { discountedPrice: discounted(0) },
      expected: 0,
    },
    { description: 'falls back to the price without taxedPrice and discount', props: {}, expected: 1000 },
  ])('relevantShippingAmount $description', ({ props, expected }) => {
    const shippingInfo = { price: usd(1000), ...props } as ShippingInfo;
    expect(relevantShippingAmount(shippingInfo)).toEqual(usd(expected));
  });

  test.each([
    { description: 'uses the gross discount when provided', discountedGrossAmount: usd(595), expected: 595 },
    { description: 'falls back to discountedAmount', discountedGrossAmount: undefined, expected: 500 },
  ])('relevantDiscountAmount $description', ({ discountedGrossAmount, expected }) => {
    const discount = { discountedAmount: usd(500), discountedGrossAmount } as DiscountOnTotalPrice;
    expect(relevantDiscountAmount(discount)).toEqual(usd(expected));
  });
});
