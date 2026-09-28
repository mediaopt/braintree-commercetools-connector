import { describe, test, expect, afterEach, jest, beforeEach } from '@jest/globals';
import { Cart } from '@commercetools/connect-payments-sdk';

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

const toCents = (amount: string) => Math.round(Number(amount) * 100);
// what the charged amount resolves to: gross when commercetools provides it, totalPrice otherwise
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
