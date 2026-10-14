import {
  Cart,
  CentPrecisionMoney,
  DiscountOnTotalPrice,
  Payment,
  ShippingInfo,
  TypedMoney,
} from '@commercetools/platform-sdk';
import { mapCommercetoolsMoneyToBraintreeMoney } from 'common-connect/dist';

export const toNum = (money: TypedMoney | undefined): number =>
  money ? Number(mapCommercetoolsMoneyToBraintreeMoney(money)) : 0;

// Every amount sent to Braintree is what the buyer pays as computed by commercetools: the gross when commercetools
// taxed it, the untaxed price otherwise (tax not included in price only shows up in the gross). Only the processor
// applies this; the enabler forwards the values as they are. Cart total: the SDK's getPaymentAmount (which also
// subtracts approved payments). Line items: see mapCTLineItemToBraintreeLineItem.
// taxedPrice already includes a shipping discount; without it, the discounted price is what the buyer pays
export const relevantShippingAmount = (shippingInfo: ShippingInfo) =>
  shippingInfo.taxedPrice?.totalGross ?? shippingInfo.discountedPrice?.value ?? shippingInfo.price;
export const relevantDiscountAmount = (discount: DiscountOnTotalPrice) =>
  discount.discountedGrossAmount ?? discount.discountedAmount;

// Counted as paid as in the SDK's getPaymentAmount (its private calculatePaymentAmount): a Pending/Success Authorization
// or Charge, unless a Pending/Success CancelAuthorization or Refund reverted it
const paidAmount = ({ transactions, amountPlanned }: Payment): number =>
  transactions.some(
    ({ type, state }) =>
      (type === 'CancelAuthorization' || type === 'Refund') && (state === 'Success' || state === 'Pending'),
  ) ||
  !transactions.some(
    ({ type, state }) =>
      (type === 'Authorization' || type === 'Charge') && (state === 'Success' || state === 'Pending'),
  )
    ? 0
    : amountPlanned.centAmount;

// What is left to pay for one payment: the cart's gross minus what its other payments cover. Only the other payments
// are read (none in the common case), unlike getPaymentAmount, which reads every payment after the cart
export const amountLeftForPayment = async (
  cart: Cart,
  paymentId: string,
  getPayment: (id: string) => Promise<Payment>,
): Promise<CentPrecisionMoney> => {
  const otherPayments = await Promise.all(
    (cart.paymentInfo?.payments ?? []).filter(({ id }) => id !== paymentId).map(({ id }) => getPayment(id)),
  );
  const { currencyCode, centAmount, fractionDigits } = cart.taxedPrice?.totalGross ?? cart.totalPrice;
  const paid = otherPayments.reduce((total, payment) => total + paidAmount(payment), 0);
  return { type: 'centPrecision', currencyCode, centAmount: centAmount - paid, fractionDigits };
};
