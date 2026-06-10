import { LineItem } from '@commercetools/connect-payments-sdk';
import { mapCommercetoolsMoneyToBraintreeMoney } from 'common-connect';
import { Static, Type } from '@sinclair/typebox';

export enum LineItemKind {
  Debit = 'debit',
  Credit = 'credit',
}

// Fields reference: PayPalCheckoutUpdatePaymentOptions in braintree-web/paypal-checkout — not a 1:1 match but the closest type
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

//tax and discount are not mapped separately to avoid rounding issues
export const mapCTLineItemToBraintreeLineItem = (ctLineItem: LineItem, cartLocale?: string): BraintreeLineItem => {
  const totalItemPrice = mapCommercetoolsMoneyToBraintreeMoney(ctLineItem.totalPrice);
  const localizedName = cartLocale && ctLineItem.name[cartLocale] ? ctLineItem.name[cartLocale] : ctLineItem.name[0];
  const nameWithQuantity =
    ctLineItem.quantity > 1 ? `${localizedName} (x${ctLineItem.quantity})` : localizedName || ctLineItem.productId;

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
