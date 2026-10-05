import { describe, test, expect, afterEach, jest, beforeEach } from '@jest/globals';
import { Cart, LineItem } from '@commercetools/connect-payments-sdk';

jest.mock('common-connect/dist', () => ({
  ...(jest.requireActual('common-connect/dist') as object),
  getClientToken: jest.fn(),
}));
import * as CommonConnect from 'common-connect/dist';
import { paymentSDK } from '../../src/payment-sdk';
import { PaymentMethodType } from '../../src/dtos/braintree-payment.dto';
import { BraintreePaymentService } from '../../src/services/braintree-payment.service';
import { BraintreePaymentServiceOptions } from '../../src/services/types/braintree-payment.type';
import * as FastifyContext from '../../src/libs/fastify/context/context';
import { mockGetPaymentResult } from '../utils/mock-payment-results';
import { realCarts } from '../utils/mock-real-carts';
import { mapCTLineItemToBraintreeLineItem } from '../../src/utils/lineItem.utils';

const toCents = (amount: string) => Math.round(Number(amount) * 100);
// what the charged amount resolves to: gross when commercetools provides it, totalPrice otherwise.
// || (not ??) mirrors relevantTotalCentAmount in lineItem.utils.ts for the zero gross fixtures (cartPrice: {}).
const expectedTotal = (cart: Cart) => cart.taxedPrice?.totalGross?.centAmount || cart.totalPrice.centAmount;

describe('real carts: mapped Braintree line items balance the charged amount', () => {
  const opts: BraintreePaymentServiceOptions = {
    ctCartService: paymentSDK.ctCartService,
    ctPaymentService: paymentSDK.ctPaymentService,
    ctPaymentMethodService: paymentSDK.ctPaymentMethodService,
  };
  const braintreePaymentService = new BraintreePaymentService(opts);

  beforeEach(() => {
    jest.resetAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each(realCarts)('$testDescription', async ({ cart: realCart }) => {
    const cart = {
      ...realCart,
      customerEmail: 'buyer@example.com',
      billingAddress: { country: 'DE' },
      shippingAddress: { country: 'DE' },
    } as Cart;
    const amountPlanned = { ...cart.totalPrice, centAmount: expectedTotal(cart) };
    jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
    jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
    // mocked on purpose: for the zero gross fixtures the real SDK getPaymentAmount throws "The cart has already been
    // paid in full" (a commercetools-side behaviour, see lineItem.utils.ts); this spec covers the line item mapping
    jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
    jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue({
      ...mockGetPaymentResult,
      amountPlanned,
      transactions: [],
      interfaceInteractions: [],
    } as never);
    jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
    jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
    (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('client-token' as never);

    const result = await braintreePaymentService.createPayment({
      paymentMethodType: PaymentMethodType.PAYPAL,
      builderType: undefined,
    } as never);

    const lineItems = result.payment.braintreeLineItems ?? [];
    const balance = lineItems.reduce(
      (sum, { kind, totalAmount }) => sum + (kind === 'credit' ? -1 : 1) * toCents(totalAmount),
      0,
    );
    expect(lineItems).toHaveLength(
      cart.lineItems.length + (cart.shippingInfo ? 1 : 0) + (cart.discountOnTotalPrice ? 1 : 0),
    );
    expect(balance).toBe(expectedTotal(cart));
  });
});

describe('mapCTLineItemToBraintreeLineItem with a high precision price', () => {
  // commercetools keeps centAmount in cents for high precision money; only fractionDigits (and preciseAmount) differ
  const highPrecisionPrice = {
    type: 'highPrecision',
    currencyCode: 'EUR',
    centAmount: 19999,
    preciseAmount: 19999000,
    fractionDigits: 5,
  };
  const lineItem = {
    productId: 'product-high-precision',
    name: { en: 'High precision item' },
    variant: { id: 1 },
    quantity: 1,
    lineItemMode: 'Standard',
    price: { value: highPrecisionPrice },
    totalPrice: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 19999, fractionDigits: 2 },
    taxedPrice: {
      totalNet: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 16806, fractionDigits: 2 },
      totalGross: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 19999, fractionDigits: 2 },
      totalTax: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 3193, fractionDigits: 2 },
      taxPortions: [],
    },
  } as unknown as LineItem;

  // guards the money metadata spread in mapCTLineItemToBraintreeLineItem: spreading price.value first would format
  // the cent amount with 5 fraction digits (0.19999 instead of 199.99)
  test('takes currency/fractionDigits from totalPrice, not from a high precision price.value', () => {
    expect(mapCTLineItemToBraintreeLineItem(lineItem).totalAmount).toBe('199.99');
  });
});
