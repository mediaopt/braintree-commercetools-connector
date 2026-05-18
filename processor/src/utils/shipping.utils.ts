import { ShippingMethod } from '@commercetools/platform-sdk';
import { Static, Type } from '@sinclair/typebox';
import { Address as CTAddress } from '@commercetools/connect-payments-sdk';
import { mapCommercetoolsMoneyToBraintreeMoney } from 'common-connect';

/**
 * Corresponds to ShippinOption interface for frontend
 */
export interface ShippingOption {
  id: string;
  label: string;
  type: string;
  selected: boolean;
  amount: {
    value: string;
    currency: string;
  };
}

export enum ShippingOptionType {
  Shipping = 'SHIPPING',
  Pickup = 'PICKUP',
}

export type BraintreeShippingOption = ShippingOption & { countryCode: string };

/**
 * Schema for BraintreeShippingOption - based on the BraintreeShippingOption type
 * Provides runtime validation for shipping options with country codes
 */
export const BraintreeShippingOptionSchema = Type.Object({
  id: Type.String(),
  label: Type.String(),
  type: Type.String(),
  selected: Type.Boolean(),
  countryCode: Type.String(),
  amount: Type.Object({
    value: Type.String(),
    currency: Type.String(),
  }),
});

export const BraintreeShippingSchema = Type.Object({
  countryCodeAlpha2: Type.String(),
  firstName: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String()),
  postalCode: Type.Optional(Type.String()),
  streetAddress: Type.String(),
  region: Type.Optional(Type.String()),
});

export type BraintreeShipping = Static<typeof BraintreeShippingSchema>;

/**
 * Maps commercetools ShippingMethod to Braintree shipping options
 * Flattens the zone rates and filters for valid shipping options with amounts
 *
 * @param shippingMethods - Array of commercetools ShippingMethod
 * @param currencyCode - Currency code to filter shipping rates
 * @param cartShippingId - Current selected shipping method
 * @returns Array of Braintree shipping options with country codes and amounts
 */
export const mapShippingMethodsToBraintreeShippingOptions = (
  shippingMethods: ShippingMethod[],
  currencyCode: string,
  cartShippingId?: string,
): BraintreeShippingOption[] | undefined => {
  return shippingMethods
    .flatMap(({ id, zoneRates, name, localizedName }) =>
      zoneRates.flatMap(
        ({ zone, shippingRates }) =>
          zone.obj?.locations.map(({ country }) => ({
            id,
            label: localizedName?.[country] || name,
            countryCode: country,
            amount: {
              value: shippingRates.find(({ price }) => price.currencyCode === currencyCode)?.price,
              currency: currencyCode,
            },
          })) || [],
      ),
    )
    .filter((rate) => rate !== undefined && rate.amount.value !== undefined)
    .map((item) => ({
      ...item,
      selected: cartShippingId === item.id,
      type: ShippingOptionType.Shipping,
      amount: {
        ...item.amount,
        value: item.amount.value ? `${mapCommercetoolsMoneyToBraintreeMoney(item.amount.value)}` : '0.00',
      },
    })); //Pickup is not supported in current connector realization
};

/**
 * Maps commercetools Address to Braintree shipping address
 * Combines street name and number into a single street address field
 *
 * @param ctShipping - Commercetools Address object
 * @returns Braintree shipping address with properly formatted fields
 */
export const mapCTShippingToBraintreeShipping = (ctShipping: CTAddress): BraintreeShipping => {
  return {
    countryCodeAlpha2: ctShipping.country,
    firstName: ctShipping.firstName,
    lastName: ctShipping.lastName,
    postalCode: ctShipping.postalCode,
    streetAddress: ctShipping.streetName + (ctShipping.streetNumber ? ' ' + ctShipping.streetNumber : ''),
    region: ctShipping.city,
  };
};
