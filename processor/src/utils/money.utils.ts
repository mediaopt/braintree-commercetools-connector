import { DiscountOnTotalPrice, ShippingInfo, TypedMoney } from '@commercetools/platform-sdk';
import { Cart } from '@commercetools/connect-payments-sdk';
import { mapCommercetoolsMoneyToBraintreeMoney } from 'common-connect/dist';

export const toNum = (money: TypedMoney | undefined): number =>
  money ? Number(mapCommercetoolsMoneyToBraintreeMoney(money)) : 0;

// Every amount sent to Braintree is what the buyer pays as computed by commercetools: the gross when commercetools
// taxed it, the untaxed price otherwise (tax not included in price only shows up in the gross). Only the processor
// applies this; the enabler forwards the values as they are. Line items: see mapCTLineItemToBraintreeLineItem.
export const relevantCartAmount = (cart: Cart) => cart.taxedPrice?.totalGross ?? cart.totalPrice;
// taxedPrice already includes a shipping discount; without it, the discounted price is what the buyer pays
export const relevantShippingAmount = (shippingInfo: ShippingInfo) =>
  shippingInfo.taxedPrice?.totalGross ?? shippingInfo.discountedPrice?.value ?? shippingInfo.price;
export const relevantDiscountAmount = (discount: DiscountOnTotalPrice) =>
  discount.discountedGrossAmount ?? discount.discountedAmount;
