import { describe, test, expect } from '@jest/globals';
import { mapCTLineItemToBraintreeLineItem } from '../../src/utils/lineItem.utils';
import { LineItem } from '@commercetools/connect-payments-sdk';

describe('lineItem.utils', () => {
  describe('mapCTLineItemToBraintreeLineItem', () => {
    const baseLineItem: LineItem = {
      id: 'line-1',
      productId: 'product-123',
      name: {
        en: 'Product Name',
        'de-DE': 'Produktname',
      },
      productType: { id: 'type-1', typeId: 'product-type' },
      price: {
        id: 'price-1',
        value: {
          type: 'centPrecision',
          currencyCode: 'USD',
          centAmount: 10000,
          fractionDigits: 2,
        },
      },
      quantity: 1,
      totalPrice: {
        type: 'centPrecision',
        currencyCode: 'USD',
        centAmount: 10000,
        fractionDigits: 2,
      },
      discountedPricePerQuantity: [],
      taxedPricePortions: [],
      state: [],
      perMethodTaxRate: [],
      priceMode: 'Platform',
      lineItemMode: 'Standard',
      variant: {
        id: 1,
        sku: 'sku-123',
      },
    };

    test('maps basic line item without quantity suffix', () => {
      const result = mapCTLineItemToBraintreeLineItem(baseLineItem);

      expect(result).toEqual({
        name: 'Product Name',
        kind: 'debit',
        quantity: '1',
        unitAmount: '100.00',
        totalAmount: '100.00',
        productCode: 'product-123',
        unitTaxAmount: '0.00',
        description: '',
        url: '',
        commodityCode: '',
        discountAmount: '0.00',
        taxAmount: '0.00',
        unitOfMeasure: 'unit',
      });
    });

    test.each([
      {
        description: 'adds a quantity suffix when quantity > 1',
        item: { quantity: 3 },
        locale: undefined,
        expected: 'Product Name (x3)',
      },
      {
        description: 'uses the localized name when the locale matches',
        item: {},
        locale: 'de-DE',
        expected: 'Produktname',
      },
      {
        description: 'falls back to the first name when the locale is not found',
        item: {},
        locale: 'fr-FR',
        expected: 'Product Name',
      },
      {
        description: 'falls back to productId when no name is available',
        item: { name: {} },
        locale: undefined,
        expected: 'product-123',
      },
    ])('name: $description', ({ item, locale, expected }) => {
      expect(mapCTLineItemToBraintreeLineItem({ ...baseLineItem, ...item }, locale).name).toBe(expected);
    });

    test('includes image URL from variant', () => {
      const item = {
        ...baseLineItem,
        variant: {
          id: 1,
          sku: 'sku-123',
          images: [{ url: 'https://example.com/image.jpg', dimensions: { w: 100, h: 100 } }],
        },
      };
      const result = mapCTLineItemToBraintreeLineItem(item);

      expect(result.url).toBe('https://example.com/image.jpg');
    });

    test('sets description to GIFT for gift line items', () => {
      const item: LineItem = { ...baseLineItem, lineItemMode: 'GiftLineItem' };
      const result = mapCTLineItemToBraintreeLineItem(item);

      expect(result.description).toBe('GIFT');
    });

    test('truncates productCode to 12 characters', () => {
      const item = { ...baseLineItem, productId: 'very-long-product-id-that-is-more-than-12-chars' };
      const result = mapCTLineItemToBraintreeLineItem(item);

      expect(result.productCode).toBe('very-long-pr');
    });
  });
});
