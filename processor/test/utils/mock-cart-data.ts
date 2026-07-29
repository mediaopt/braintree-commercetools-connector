import { Cart, LineItem, CustomLineItem, ShippingInfo } from '@commercetools/connect-payments-sdk';
import { TaxedPrice } from '@commercetools/platform-sdk';
import { randomUUID } from 'crypto';

export const mockGetCartResult = () => {
  const cartId = randomUUID();
  const mockGetCartResult: Cart = {
    priceRoundingMode: 'HalfEven',
    id: cartId,
    version: 1,
    lineItems: [lineItem],
    customLineItems: [customLineItem],
    totalPrice: {
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount: 150000,
      fractionDigits: 2,
    },
    cartState: 'Ordered',
    origin: 'Customer',
    taxMode: 'ExternalAmount',
    taxRoundingMode: 'HalfEven',
    taxCalculationMode: 'LineItemLevel',
    shipping: [],
    discountCodes: [],
    directDiscounts: [],
    refusedGifts: [],
    itemShippingAddresses: [],
    inventoryMode: 'ReserveOnOrder',
    shippingMode: 'Single',
    shippingInfo: shippingInfo,
    createdAt: '2024-01-01T00:00:00Z',
    lastModifiedAt: '2024-01-01T00:00:00Z',
  };
  return mockGetCartResult;
};

const lineItem: LineItem = {
  id: 'lineitem-id-1',
  productId: 'product-id-1',
  name: {
    en: 'lineitem-name-1',
  },
  productType: {
    id: 'product-type-reference-1',
    typeId: 'product-type',
  },
  price: {
    id: 'price-id-1',
    value: {
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount: 150000,
      fractionDigits: 2,
    },
  },
  quantity: 1,
  totalPrice: {
    type: 'centPrecision',
    currencyCode: 'USD',
    centAmount: 150000,
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
    sku: 'variant-sku-1',
  },
};

const customLineItem: CustomLineItem = {
  id: 'customLineItem-id-1',
  name: {
    en: 'customLineItem-name-1',
  },
  slug: '',
  money: {
    type: 'centPrecision',
    currencyCode: 'USD',
    centAmount: 150000,
    fractionDigits: 2,
  },
  quantity: 1,
  totalPrice: {
    type: 'centPrecision',
    currencyCode: 'USD',
    centAmount: 150000,
    fractionDigits: 2,
  },
  discountedPricePerQuantity: [],
  taxedPricePortions: [],
  state: [],
  perMethodTaxRate: [],
  priceMode: 'Platform',
};

const shippingInfo: ShippingInfo = {
  shippingMethodName: 'shippingMethodName1',
  price: {
    type: 'centPrecision',
    currencyCode: 'USD',
    centAmount: 150000,
    fractionDigits: 2,
  },
  shippingRate: {
    price: {
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount: 1000,
      fractionDigits: 2,
    },
    tiers: [],
  },
  shippingMethodState: 'MatchesCart',
};

// Cart for updateCartShipping tests — realistic amounts that produce non-trivial itemTotal
const shippingInfoForUpdate: ShippingInfo = {
  shippingMethodName: 'Standard',
  price: {
    type: 'centPrecision',
    currencyCode: 'USD',
    centAmount: 2000, // $20.00
    fractionDigits: 2,
  },
  shippingRate: {
    price: { type: 'centPrecision', currencyCode: 'USD', centAmount: 2000, fractionDigits: 2 },
    tiers: [],
  },
  shippingMethodState: 'MatchesCart',
};

// totalPrice: $200.00; shippingInfo: $20.00; taxMode Platform → taxTotal "0.00"; itemTotal = 200 - 20 = "180.00"
export const mockCartForShippingUpdate = (): Cart => ({
  ...mockGetCartResult(),
  id: 'cart-shipping-update',
  version: 2,
  totalPrice: { type: 'centPrecision', currencyCode: 'USD', centAmount: 20000, fractionDigits: 2 },
  taxMode: 'Platform',
  shippingInfo: shippingInfoForUpdate,
  discountOnTotalPrice: undefined,
});

const taxedPriceWithExternalTax: TaxedPrice = {
  totalNet: { type: 'centPrecision', currencyCode: 'USD', centAmount: 16500, fractionDigits: 2 },
  totalGross: { type: 'centPrecision', currencyCode: 'USD', centAmount: 20000, fractionDigits: 2 },
  // totalTax: $20.00
  totalTax: { type: 'centPrecision', currencyCode: 'USD', centAmount: 2000, fractionDigits: 2 },
  taxPortions: [],
};

// totalPrice: $200.00; shippingInfo: $10.00; discount: $5.00; taxMode ExternalAmount; taxTotal: $20.00
// itemTotal = 200 - 10 + 5 - 20 = "175.00"
export const mockCartWithExternalTax = (): Cart => ({
  ...mockGetCartResult(),
  id: 'cart-external-tax',
  version: 2,
  totalPrice: { type: 'centPrecision', currencyCode: 'USD', centAmount: 20000, fractionDigits: 2 },
  taxMode: 'ExternalAmount',
  taxedPrice: taxedPriceWithExternalTax,
  shippingInfo: {
    ...shippingInfoForUpdate,
    price: { type: 'centPrecision', currencyCode: 'USD', centAmount: 1000, fractionDigits: 2 }, // $10.00
  },
  discountOnTotalPrice: {
    discountedAmount: { type: 'centPrecision', currencyCode: 'USD', centAmount: 500, fractionDigits: 2 }, // $5.00
    includedDiscounts: [],
  },
});
