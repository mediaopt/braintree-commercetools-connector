import { Cart } from '@commercetools/connect-payments-sdk';
import { CentPrecisionMoney, LineItemMode } from '@commercetools/platform-sdk';

type RealCartTestData = { testDescription: string; cart: Cart };

// Carts taken from real commercetools sandbox carts, reduced to the fields that affect price mapping.
// The generators below are ported from PayPal commercetools connector
// paypal-commercetools-extension/tests/constants.ts - same purpose cart reducing to relevant fields only.
// Multi-shipping is not ported. If you are interested in a feature in this connector please open an issue.
// Note the generator quirks, kept on purpose because they reproduce real CT responses:
// - a line item given only gross/net/tax has no totalPrice
// - a line item given only totalPrice has an all-zero taxedPrice (no gross available, e.g. external tax)

type PriceGenerationProps = { gross?: number; net?: number; tax?: number };
type DiscountGenerationProps = { gross?: number; net?: number; amount: number };

const currencyData: Omit<CentPrecisionMoney, 'centAmount'> = {
  type: 'centPrecision',
  currencyCode: 'EUR',
  fractionDigits: 2,
};

const centPrice = (centAmount = 0): CentPrecisionMoney => ({ ...currencyData, centAmount });

const taxedPrice = ({ gross = 0, net = 0, tax = 0 }: PriceGenerationProps) => ({
  totalGross: centPrice(gross),
  totalNet: centPrice(net),
  totalTax: centPrice(tax),
  taxPortions: [],
});

const fullPriceData = (priceData: PriceGenerationProps) => ({
  taxedPrice: taxedPrice(priceData),
  totalPrice: centPrice(priceData.gross ?? 0),
});

const generateLineItemProps = (
  itemPrice: number,
  referenceName?: string,
  discountedPrice?: number,
  lineItemMode?: LineItemMode,
) => ({
  name: referenceName ? { en: `name${referenceName}` } : {},
  id: `id${itemPrice}`,
  productId: `product-${referenceName ?? 'nameless'}`,
  variant: { id: 1, sku: `sku${referenceName}` },
  taxRate: { amount: 0.19 },
  lineItemMode: lineItemMode ?? 'Standard',
  price: {
    value: centPrice(itemPrice),
    discounted: discountedPrice
      ? { value: centPrice(discountedPrice), discount: { typeId: 'product-discount', id: 'irrelevantForMapping' } }
      : undefined,
  },
});

const testLineItemsBaseData = {
  doubleDiscountedItemWithGift: generateLineItemProps(19999, 'amanda brown', 18599), // forces a cart discount and a gift
  giftLineItem: generateLineItemProps(0, 'amanda brown', undefined, 'GiftLineItem'),
  taxNotIncludedInBasePrice: generateLineItemProps(19999, 'amanda red', 18599),
  zeroPriceItem: generateLineItemProps(0, 'allO'), // price directly set to 0, not a commercetools GiftLineItem
  nameless: generateLineItemProps(0), // commercetools name is an empty object
  externalDiscounted: generateLineItemProps(29900, 'external', 25415),
};

type LineItemGenerationData = PriceGenerationProps & {
  itemType: keyof typeof testLineItemsBaseData;
  quantity: number;
  totalPrice?: CentPrecisionMoney;
};

type CartGenerationData = {
  lineItemsData: LineItemGenerationData[];
  cartPrice?: PriceGenerationProps;
  discount?: DiscountGenerationProps;
  customCartProps?: Record<string, unknown>;
};

const lineItemFromLineItemData = ({ itemType, quantity, gross, net, tax, totalPrice }: LineItemGenerationData) => ({
  ...testLineItemsBaseData[itemType],
  ...fullPriceData({ gross, net, tax }),
  quantity,
  totalPrice,
});

const cartFromCartData = ({ lineItemsData, cartPrice, discount, customCartProps = {} }: CartGenerationData): Cart =>
  ({
    id: 'real-cart',
    version: 1,
    priceRoundingMode: 'HalfEven',
    discountCodes: [],
    directDiscounts: [],
    taxMode: 'Platform',
    taxRoundingMode: 'HalfEven',
    taxCalculationMode: 'LineItemLevel',
    locale: 'de',
    shippingMode: 'Single',
    customLineItems: [],
    lineItems: lineItemsData.map(lineItemFromLineItemData),
    ...fullPriceData(cartPrice ?? lineItemsData[0]),
    discountOnTotalPrice: discount
      ? {
          discountedAmount: centPrice(discount.amount),
          discountedNetAmount: discount.net ? centPrice(discount.net) : undefined,
          discountedGrossAmount: discount.gross ? centPrice(discount.gross) : undefined,
          includedDiscounts: [],
        }
      : undefined,
    ...customCartProps,
  }) as unknown as Cart;

const giftLineItem: LineItemGenerationData = { itemType: 'giftLineItem', quantity: 1 };

// Each cart covers a mapping rule the others don't — see the coverage notes per entry.
const payPalConnectorCarts: RealCartTestData[] = [
  {
    // no gross, no totalPrice, no product discount: falls back to price.value, name falls back to productId
    testDescription: 'nameless zero price item',
    cart: cartFromCartData({ lineItemsData: [{ itemType: 'nameless', quantity: 1 }] }),
  },
  {
    // quantity > 1 with a 0 unit price (name gets the quantity suffix)
    testDescription: 'nine zero price items with external tax',
    cart: cartFromCartData({ lineItemsData: [{ itemType: 'zeroPriceItem', quantity: 9 }] }),
  },
  {
    // gross is 0, amount is in totalPrice; cart discount without gross amount; no shipping
    testDescription: 'item with two discounts and gift and item with external tax',
    cart: cartFromCartData({
      lineItemsData: [
        { itemType: 'taxNotIncludedInBasePrice', quantity: 3, totalPrice: centPrice(55797) },
        { itemType: 'doubleDiscountedItemWithGift', quantity: 1, totalPrice: centPrice(18599) },
        giftLineItem,
      ],
      cartPrice: {},
      discount: { amount: 9671 },
      customCartProps: { totalPrice: centPrice(64725) },
    }),
  },
  {
    // ExternalAmount tax: neither gross nor totalPrice, falls back to the discounted price; shipping without taxedPrice
    testDescription: 'external amount tax with discount',
    cart: cartFromCartData({
      lineItemsData: [{ itemType: 'externalDiscounted', quantity: 1 }],
      discount: { amount: 2262 },
      customCartProps: {
        taxMode: 'ExternalAmount',
        totalPrice: centPrice(73153),
        shippingInfo: { shippingMethodName: 'Shipping', price: centPrice(50000) },
      },
    }),
  },
  {
    // UnitPriceLevel: cart discount gross (138.74) differs from discountedAmount (121.60); shipping with taxedPrice
    testDescription: 'multiple different items in unit price level',
    cart: cartFromCartData({
      lineItemsData: [
        { itemType: 'doubleDiscountedItemWithGift', quantity: 1, gross: 23134, net: 19440, tax: 3694 },
        giftLineItem,
        { itemType: 'taxNotIncludedInBasePrice', quantity: 3, gross: 82587, net: 69402, tax: 13185 },
      ],
      cartPrice: { net: 78023, gross: 92847, tax: 14824 },
      discount: { net: 11659, gross: 13874, amount: 12160 },
      customCartProps: {
        shippingInfo: {
          shippingMethodName: 'Shipping',
          price: centPrice(1000),
          taxedPrice: taxedPrice({ gross: 1000, net: 840, tax: 160 }),
        },
        taxCalculationMode: 'UnitPriceLevel',
      },
    }),
  },
];

// gross > 0; real gift line item (totalPrice 0); no cart discount; shipping with taxedPrice.
// Real cart from this connector's sandbox (ticket 38236): Platform tax mode, one item whose tax rate is not included
// in price (totalPrice 0.79 net, totalGross 0.99), a product-discounted item, a gift line item and tax-included shipping.
const usd = (centAmount: number): CentPrecisionMoney => ({ ...currencyData, currencyCode: 'USD', centAmount });
const usdTaxed = (net: number, gross: number) => ({
  totalNet: usd(net),
  totalGross: usd(gross),
  totalTax: usd(gross - net),
  taxPortions: [],
});
const externalTaxNotIncludedCart = {
  id: 'e668f325-e6b8-487a-bd07-948d6762e81c',
  version: 28,
  locale: undefined,
  taxMode: 'Platform',
  taxCalculationMode: 'LineItemLevel',
  shippingMode: 'Single',
  customLineItems: [],
  lineItems: [
    {
      productId: '2117bafa-7b7b-4200-bc0f-cf8b4fea88d4',
      name: { en: 'Demo Free Item' },
      variant: { id: 1 },
      quantity: 1,
      lineItemMode: 'Standard',
      price: { value: usd(92) },
      totalPrice: usd(92),
      taxedPrice: usdTaxed(77, 92),
    },
    {
      productId: '2117bafa-7b7b-4200-bc0f-cf8b4fea88d4',
      name: { en: 'Demo Free Item' },
      variant: { id: 1 },
      quantity: 1,
      lineItemMode: 'GiftLineItem',
      price: { value: usd(92) },
      totalPrice: usd(0),
      taxedPrice: usdTaxed(0, 0),
    },
    {
      productId: '827bdeed-fbb2-4000-b688-50fb3aabda12',
      name: { en: 'Demo Exact Discount' },
      variant: { id: 1 },
      quantity: 1,
      lineItemMode: 'Standard',
      price: { value: usd(24), discounted: { value: usd(14) } },
      totalPrice: usd(14),
      taxedPrice: usdTaxed(12, 14),
    },
    {
      productId: '1da5a570-03bc-4200-82a3-e983d668b821',
      name: { en: 'Demo External Tax' },
      variant: { id: 1 },
      quantity: 1,
      lineItemMode: 'Standard',
      price: { value: usd(79) },
      totalPrice: usd(79),
      taxedPrice: usdTaxed(79, 99),
    },
  ],
  totalPrice: usd(202),
  taxedPrice: usdTaxed(184, 222),
  shippingInfo: {
    shippingMethodName: 'Custom WW Shipping',
    price: usd(17),
    taxedPrice: usdTaxed(16, 17),
  },
} as unknown as Cart;

// Real cart from this connector's sandbox, replacing the PayPal connector's 'item with two discounts and gift with unit price
// level set on cart' (its generated cart-level taxedPrice didn't match its discounted total): UnitPriceLevel, a 0% tax item
// (quantity 200), 19% included items, a product discount, a percentage line-item cart discount, a gift line item, an item
// with 85% tax not included in price, and a total price discount whose discountedGrossAmount (1426.02) differs from
// discountedAmount (1426.00).
// totalPrice is the gross price for tax included in price and the net price for tax not included in price
const eurLineItem = (
  productId: string,
  name: string,
  quantity: number,
  gross: number,
  net: number,
  {
    lineItemMode = 'Standard',
    taxIncludedInPrice = true,
  }: { lineItemMode?: LineItemMode; taxIncludedInPrice?: boolean } = {},
) => ({
  productId,
  name: { en: name },
  variant: { id: 1 },
  quantity,
  lineItemMode,
  price: { value: centPrice(gross) },
  totalPrice: centPrice(taxIncludedInPrice ? gross : net),
  taxedPrice: taxedPrice({ gross, net, tax: gross - net }),
});
const unitPriceLevelTotalDiscountCart = {
  id: 'b0c8fa8a-4edf-4e89-9a5a-110d51a19505',
  version: 33,
  locale: undefined,
  taxMode: 'Platform',
  taxCalculationMode: 'UnitPriceLevel',
  shippingMode: 'Single',
  customLineItems: [],
  lineItems: [
    eurLineItem('ee1b0e82-b697-4b7b-bef9-63d3b8b92878', 'Demo Standard Product 1', 1, 18, 15),
    eurLineItem('3d36c3b7-2490-424a-8a53-48b7c62d02d3', 'Demo Free Item', 1, 65, 55),
    eurLineItem('3d36c3b7-2490-424a-8a53-48b7c62d02d3', 'Demo Free Item', 1, 0, 0, { lineItemMode: 'GiftLineItem' }),
    eurLineItem('13fae9f4-d4a3-4208-a192-88a12c6ed76f', 'Demo Exact Discount', 1, 77, 65),
    eurLineItem('b013d2de-9e51-4b9c-b0c5-253e1191ba21', 'Demo Percent Discount', 1, 110, 92),
    eurLineItem('1e3cb950-b934-4739-aa07-ed30da6b9586', 'Demo External Tax', 1, 142, 77, { taxIncludedInPrice: false }),
    eurLineItem('ec59fede-a877-4f00-84ec-1da36ee5c36e', 'Sweater Stone Island red', 200, 4753000, 4753000),
  ],
  totalPrice: centPrice(4610747),
  taxedPrice: taxedPrice({ gross: 4610810, net: 4610705, tax: 105 }),
  discountOnTotalPrice: {
    discountedAmount: centPrice(142600),
    discountedNetAmount: centPrice(142599),
    discountedGrossAmount: centPrice(142602),
    includedDiscounts: [],
  },
} as unknown as Cart;

export const realCarts: RealCartTestData[] = [
  ...payPalConnectorCarts,
  {
    testDescription: 'tax not included in price, gift, product discount (ticket 38236)',
    cart: externalTaxNotIncludedCart,
  },
  {
    testDescription: 'unit price level with 0% tax item, gift and total price discount',
    cart: unitPriceLevelTotalDiscountCart,
  },
];
