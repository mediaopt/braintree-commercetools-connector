import { Cart, LineItem } from '@commercetools/connect-payments-sdk';
import { mapCommercetoolsMoneyToBraintreeMoney } from 'common-connect';
import { log } from '../libs/logger';
import { Static, Type } from '@sinclair/typebox';
import { relevantDiscountAmount, relevantShippingAmount } from './money.utils';

export enum LineItemKind {
  Debit = 'debit',
  Credit = 'credit',
}

// Fields reference: PayPalCheckoutUpdatePaymentOptions in braintree-web/paypal-checkout — not a 1:1 match but the closest type available
export const BraintreeLineItemSchema = Type.Object({
  name: Type.String(),
  kind: Type.Enum(LineItemKind),
  quantity: Type.String(),
  unitAmount: Type.String(),
  totalAmount: Type.String(),
  productCode: Type.String(),
  unitTaxAmount: Type.String(),
  description: Type.String(),
  url: Type.String(),
  unitOfMeasure: Type.Optional(Type.Literal('unit')),
  taxAmount: Type.Optional(Type.String()),
  discountAmount: Type.Optional(Type.String()),
  commodityCode: Type.Optional(Type.String()),
});

export type BraintreeLineItem = Static<typeof BraintreeLineItemSchema>;

export const lineItemPlaceholders = {
  quantity: '1',
  unitTaxAmount: '0.00',
  description: '',
  url: '',
  commodityCode: '',
  discountAmount: '',
  taxAmount: '',
  unitOfMeasure: 'unit' as const,
};

// Gross is preferred so tax not included in price (includedInPrice: false) is still covered.
// Fallbacks, for responses seen only with specific project settings (some projects created after 2024):
// - an all-zero taxedPrice: totalPrice holds the amount. Seen in a real cart, with the cart's own taxedPrice all
//   zero too, so the payments SDK's getPaymentAmount currently throws "The cart has already been paid in full" and no
//   checkout payment can be created (if you experience this, please open a commercetools issue). Kept, as in the
//   PayPal connector's extension, where it works, so line items stay correct once getPaymentAmount gets the same fallback.
// - no totalPrice: the (discounted) unit price times quantity.
const relevantTotalCentAmount = ({ lineItemMode, taxedPrice, totalPrice, price, quantity }: LineItem) => {
  if (lineItemMode === 'GiftLineItem') return 0;
  return (
    (taxedPrice?.totalGross?.centAmount || totalPrice?.centAmount) ??
    (price.discounted?.value ?? price.value).centAmount * quantity
  );
};

//tax and discount are not mapped separately to avoid rounding issues
export const mapCTLineItemToBraintreeLineItem = (ctLineItem: LineItem, cartLocale?: string): BraintreeLineItem => {
  // currency and fractionDigits must match the money the cent amount comes from: totalPrice/taxedPrice are always cent
  // precision, while price.value can be high precision (its fractionDigits > the currency's) with a centAmount in cents
  const { taxedPrice, totalPrice, price } = ctLineItem;
  const totalItemPrice = mapCommercetoolsMoneyToBraintreeMoney({
    ...(totalPrice ?? taxedPrice?.totalGross ?? price.value),
    centAmount: relevantTotalCentAmount(ctLineItem),
  });
  const localizedName =
    (cartLocale && ctLineItem.name[cartLocale]) || Object.values(ctLineItem.name)[0] || ctLineItem.productId;
  const nameWithQuantity = ctLineItem.quantity > 1 ? `${localizedName} (x${ctLineItem.quantity})` : localizedName;

  // Get image URL from variant if available
  const imageUrl = ctLineItem.variant?.images?.[0]?.url || '';

  // Get description from variant or use the product name
  const description = ctLineItem.lineItemMode === 'GiftLineItem' ? 'GIFT' : '';

  return {
    description,
    unitTaxAmount: '0.00',
    url: imageUrl,
    name: nameWithQuantity,
    kind: 'debit' as LineItemKind,
    unitOfMeasure: 'unit',
    taxAmount: '0.00',
    discountAmount: '0.00',
    quantity: '1',
    unitAmount: totalItemPrice,
    totalAmount: totalItemPrice,
    productCode: ctLineItem.productId.substring(0, 12),
    commodityCode: '',
  };
};

// Single source for the DISCOUNT credit item — transactionSale filters on and rebuilds this exact shape for PayPal.
export const DISCOUNT_PRODUCT_CODE = 'DISCOUNT';
const SHIPPING_PRODUCT_CODE = 'SHIPPING';
export const buildDiscountLineItem = (amount: string): BraintreeLineItem => ({
  name: 'Discount',
  kind: 'credit' as LineItemKind,
  unitAmount: amount,
  totalAmount: amount,
  productCode: DISCOUNT_PRODUCT_CODE,
  ...lineItemPlaceholders,
});

// The line items createPayment sends to the enabler, which sends them back to transactionSale (see sameLineItems):
// the cart's line items, its discount and, except for Express, its shipping
export const buildCartLineItems = (ctCart: Cart, isExpress: boolean): BraintreeLineItem[] => {
  const lineItems = ctCart.lineItems.map((lineItem) => mapCTLineItemToBraintreeLineItem(lineItem, ctCart.locale));
  if (ctCart.discountOnTotalPrice?.discountedAmount) {
    lineItems.push(
      buildDiscountLineItem(mapCommercetoolsMoneyToBraintreeMoney(relevantDiscountAmount(ctCart.discountOnTotalPrice))),
    );
  }
  if (!isExpress && ctCart.shippingInfo) {
    const amount = mapCommercetoolsMoneyToBraintreeMoney(relevantShippingAmount(ctCart.shippingInfo));
    lineItems.push({
      name: ctCart.shippingInfo.shippingMethodName || 'Shipping',
      kind: 'debit' as LineItemKind,
      unitAmount: amount,
      totalAmount: amount,
      productCode: SHIPPING_PRODUCT_CODE,
      ...lineItemPlaceholders,
    });
  }
  return lineItems;
};

// createPayment sends shipping as a line item for standard methods and in PayPal's breakdown for Express; the exact
// amount check covers it either way, so it is left out of the line item comparison
const withoutShipping = (lineItems: BraintreeLineItem[]): BraintreeLineItem[] =>
  lineItems.filter(({ productCode }) => productCode !== SHIPPING_PRODUCT_CODE);

const sortedKeys = (lineItems: BraintreeLineItem[], toKey: (lineItem: BraintreeLineItem) => unknown): string =>
  JSON.stringify(withoutShipping(lineItems).map(toKey).sort());

// What the buyer agreed to per line item, in any order: the product and its total price. The name may change (e.g. a
// renamed product) without changing what is bought.
const lineItemKeys = (lineItems: BraintreeLineItem[]): string =>
  sortedKeys(lineItems, ({ productCode, totalAmount }) => [productCode, totalAmount]);

// After an Express shipping change prices may change (taxes, discounts), so only the products; the discount item comes
// and goes with them. The amount check keeps the total exact. Braintree line items carry no real quantity (always 1,
// the commercetools quantity is only in the name), so a quantity change is caught by the total only.
const productKeys = (lineItems: BraintreeLineItem[]): string =>
  sortedKeys(
    lineItems.filter(({ productCode }) => productCode !== DISCOUNT_PRODUCT_CODE),
    ({ productCode }) => productCode,
  );

/**
 * Whether the line items transactionSale submitted (the enabler's createPayment copy) are still the cart's: product and
 * price, or after an Express shipping change only the product. None submitted: nothing to compare — the amount check
 * still keeps the charge exact, and Braintree gets no line items.
 */
export const sameLineItems = (
  submitted: BraintreeLineItem[] | undefined,
  ctCart: Cart,
  expressShippingChanged: boolean,
): boolean => {
  if (!submitted) return true;
  const keys = expressShippingChanged ? productKeys : lineItemKeys;
  return keys(submitted) === keys(buildCartLineItems(ctCart, false));
};

/**
 * Checks that the line items add up to the itemTotal of the amount breakdown.
 *
 * itemTotal is derived from the cart total (total - shipping + discount), while the line items are mapped one by one
 * (see mapCTLineItemToBraintreeLineItem). The two are computed independently, so they can drift apart because of how
 * commercetools rounds:
 * - tax rounding (taxRoundingMode, taxCalculationMode LineItemLevel vs UnitPriceLevel)
 * - price rounding (priceRoundingMode)
 * - discount rounding (a cart discount split across line items, discountedGrossAmount vs discountedAmount)
 *
 * Braintree rejects a breakdown that doesn't fit its line items (ITEM_TOTAL_MISMATCH). No payment method in this
 * connector requires a breakdown (only PayPal Express receives one), so on a mismatch it is omitted.
 * A missing breakdown hides the item list in the PayPal window (only subtotal, shipping and total are shown).
 * If you experience this, please open an issue with the anonymized cart.
 *
 * Carts paid partly by another payment (e.g. a gift card) or containing custom line items are not supported yet
 * Please open an issue if you are interested in these features.
 */
export const lineItemsMatchItemTotal = (lineItems: BraintreeLineItem[], itemTotal: string, cartId: string): boolean => {
  const lineItemTotal = lineItems.reduce((sum, { totalAmount }) => sum + Number(totalAmount), 0).toFixed(2);
  if (lineItemTotal === itemTotal) return true;
  log.warn(
    `updateCartShipping: line items total (${lineItemTotal}) does not match itemTotal (${itemTotal}) for cart ${cartId}, the Braintree payment is updated without breakdown — please open an issue with the anonymized cart (prices, taxes, discounts, rounding settings) so the breakdown can be supported`,
  );
  return false;
};
