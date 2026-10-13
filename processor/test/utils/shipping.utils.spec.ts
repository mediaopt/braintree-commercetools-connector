import { describe, test, expect } from '@jest/globals';
import {
  mapShippingMethodsToBraintreeShippingOptions,
  mapCTShippingToBraintreeShipping,
} from '../../src/utils/shipping.utils';
import { ShippingMethod } from '@commercetools/platform-sdk';
import { Address as CTAddress } from '@commercetools/connect-payments-sdk';

describe('shipping.utils', () => {
  describe('mapShippingMethodsToBraintreeShippingOptions', () => {
    const zoneRates = (countries: string[], centAmount = 1000, currencyCode = 'USD'): ShippingMethod['zoneRates'] => [
      {
        zone: {
          id: 'zone-1',
          typeId: 'zone',
          obj: {
            id: 'zone-1',
            version: 1,
            createdAt: '2024-01-01T00:00:00Z',
            lastModifiedAt: '2024-01-01T00:00:00Z',
            name: 'Zone',
            locations: countries.map((country) => ({ country })),
            key: 'zone-1',
          },
        },
        shippingRates: [{ price: { type: 'centPrecision', currencyCode, centAmount, fractionDigits: 2 }, tiers: [] }],
      },
    ];

    const baseShippingMethod: ShippingMethod = {
      id: 'shipping-1',
      version: 1,
      createdAt: '2024-01-01T00:00:00Z',
      lastModifiedAt: '2024-01-01T00:00:00Z',
      name: 'Standard Shipping',
      active: true,
      localizedName: {
        US: 'Standard (US)',
        DE: 'Standard (DE)',
      },
      description: 'Standard shipping',
      taxCategory: { id: 'tax-1', typeId: 'tax-category' },
      isDefault: false,
      predicate: 'true',
      zoneRates: zoneRates(['US']),
      stores: [],
      custom: undefined,
    };

    test('maps shipping methods with locations to braintree options', () => {
      const shippingMethod: ShippingMethod = { ...baseShippingMethod, zoneRates: zoneRates(['US', 'CA']) };

      const result = mapShippingMethodsToBraintreeShippingOptions([shippingMethod], 'USD', 'shipping-1');

      expect(result).toEqual([
        {
          id: 'shipping-1',
          label: 'Standard (US)',
          countryCode: 'US',
          amount: { value: '10.00', currency: 'USD' },
          selected: true,
          type: 'SHIPPING',
        },
        {
          id: 'shipping-1',
          // localizedName fixture only defines US/DE — CA falls back to the plain `name` field
          label: 'Standard Shipping',
          countryCode: 'CA',
          amount: { value: '10.00', currency: 'USD' },
          selected: true,
          type: 'SHIPPING',
        },
      ]);
    });

    test('filters out rates without matching currency', () => {
      const shippingMethod: ShippingMethod = { ...baseShippingMethod, zoneRates: zoneRates(['US'], 1000, 'EUR') };

      expect(mapShippingMethodsToBraintreeShippingOptions([shippingMethod], 'USD')).toEqual([]);
    });

    test('maps every shipping method, not only the selected one', () => {
      const express: ShippingMethod = { ...baseShippingMethod, id: 'shipping-2', zoneRates: zoneRates(['US'], 2000) };

      const result = mapShippingMethodsToBraintreeShippingOptions([baseShippingMethod, express], 'USD', 'other-method');

      expect(result?.map(({ id, selected, amount }) => ({ id, selected, value: amount.value }))).toEqual([
        { id: 'shipping-1', selected: false, value: '10.00' },
        { id: 'shipping-2', selected: false, value: '20.00' },
      ]);
    });

    test('handles empty shipping methods array', () => {
      expect(mapShippingMethodsToBraintreeShippingOptions([], 'USD')).toEqual([]);
    });
  });

  describe('mapCTShippingToBraintreeShipping', () => {
    const baseAddress: CTAddress = {
      id: 'address-1',
      country: 'US',
      firstName: 'John',
      lastName: 'Doe',
      streetName: 'Main Street',
      streetNumber: '123',
      postalCode: '10001',
      city: 'New York',
      region: 'NY',
    };

    test('maps address fields correctly', () => {
      const result = mapCTShippingToBraintreeShipping(baseAddress);

      expect(result).toEqual({
        countryCodeAlpha2: 'US',
        firstName: 'John',
        lastName: 'Doe',
        streetAddress: 'Main Street 123',
        postalCode: '10001',
        region: 'New York',
      });
    });

    test('handles missing optional fields, including the street number', () => {
      const minimalAddress: CTAddress = {
        id: 'address-1',
        country: 'DE',
        streetName: 'Hauptstraße',
      };
      const result = mapCTShippingToBraintreeShipping(minimalAddress);

      expect(result).toEqual({
        countryCodeAlpha2: 'DE',
        firstName: undefined,
        lastName: undefined,
        streetAddress: 'Hauptstraße',
        postalCode: undefined,
        region: undefined,
      });
    });
  });
});
