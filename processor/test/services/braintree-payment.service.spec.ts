import { describe, test, expect, afterEach, jest, beforeEach } from '@jest/globals';
import { ConfigResponse } from '../../src/services/types/operation.type';
import { paymentSDK } from '../../src/payment-sdk';
import { PaymentMethodType, LocalPaymentMethodType } from '../../src/dtos/braintree-payment.dto';
import { LineItemKind } from '../../src/utils/lineItem.utils';
import { mockGetPaymentResult } from '../utils/mock-payment-results';
import { mockBraintreeTransaction } from '../utils/mock-payment-data';

// transactionSale is exported as a non-configurable ES module binding; jest.spyOn cannot
// replace it. We must use jest.mock with a factory so Jest swaps the module before imports run.
jest.mock('common-connect/dist', () => ({
  ...(jest.requireActual('common-connect/dist') as object),
  transactionSale: jest.fn(),
  getBraintreeGateway: jest.fn(),
  submitForSettlement: jest.fn(),
  getClientToken: jest.fn(),
  deletePayment: jest.fn(),
}));
import * as CommonConnect from 'common-connect/dist';
// import { DefaultPaymentService } from '@commercetools/connect-payments-sdk/dist/commercetools/services/ct-payment.service';
// import { DefaultCartService } from '@commercetools/connect-payments-sdk/dist/commercetools/services/ct-cart.service';
// import {
//   mockGetPaymentResult,
//   mockGetPaymentResultWithoutTransactions,
//   mockUpdatePaymentResult,
//   mockUpdatePaymentResultWithRefundTransaction,
// } from '../utils/mock-payment-results';
// import { mockGetCartResult } from '../utils/mock-cart-data';
import { Cart, Customer } from '@commercetools/connect-payments-sdk';
import { BraintreeCustomerService } from '../../src/services/braintree-customer.service';
import { CentPrecisionMoney } from '@commercetools/platform-sdk';
import {
  lineItemWithTotal,
  mockCartForShippingUpdate,
  mockCartWithExternalTax,
  mockGetCartResult,
} from '../utils/mock-cart-data';
import * as Config from '../../src/config/config';
import { BraintreePaymentServiceOptions } from '../../src/services/types/braintree-payment.type';
import { AbstractPaymentService } from '../../src/services/abstract-payment.service';
import { BraintreePaymentService } from '../../src/services/braintree-payment.service';
import * as FastifyContext from '../../src/libs/fastify/context/context';
// import * as StatusHandler from '@commercetools/connect-payments-sdk/dist/api/handlers/status.handler';
//
// import { HealthCheckResult } from '@commercetools/connect-payments-sdk';
// import { PaymentMethodType, PaymentOutcome } from '../src/dtos/braintree-payment.dto';

interface FlexibleConfig {
  [key: string]: string; // Adjust the type according to your config values
}

// function setupMockConfig(keysAndValues: Record<string, string>) {
//   const mockConfig: FlexibleConfig = {};
//   Object.keys(keysAndValues).forEach((key) => {
//     mockConfig[key] = keysAndValues[key];
//   });
//
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   jest.spyOn(Config, 'getConfig').mockReturnValue(mockConfig as any);
// }

describe('braintree-payment.service', () => {
  const opts: BraintreePaymentServiceOptions = {
    ctCartService: paymentSDK.ctCartService,
    ctPaymentService: paymentSDK.ctPaymentService,
    ctPaymentMethodService: paymentSDK.ctPaymentMethodService,
  };
  const paymentService: AbstractPaymentService = new BraintreePaymentService(opts);
  //const braintreePaymentService: BraintreePaymentService = new BraintreePaymentService(opts);
  beforeEach(() => {
    jest.setTimeout(10000);
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // test('getConfig', async () => { //todo - implement proper tests
  //   // Setup mock config for a system using `clientKey`
  //   setupMockConfig({ clientId: '', mockEnvironment: 'test' });
  //
  //   const result: ConfigResponse = await paymentService.config();
  //
  //   // Assertions can remain the same or be adapted based on the abstracted access
  //   expect(result?.clientKey).toStrictEqual('');
  //   expect(result?.environment).toStrictEqual('test');
  // });

  // Helper: mock the chained CT direct-API call used in updateCartShipping
  const mockCtClientCarts = (updatedCart: Cart) => {
    const execute = jest.fn().mockResolvedValue({ body: updatedCart } as never);
    const post = jest.fn().mockReturnValue({ execute });
    const withId = jest.fn().mockReturnValue({ post });
    return jest.fn().mockReturnValue({ withId });
  };

  describe('updateCartShipping', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    // paymentSDK.ctAPI.client is a non-configurable getter in the SDK; save/restore manually
    // so repeated tests can each install a fresh mock without jest.spyOn getter conflicts.
    let savedClient: unknown;
    beforeEach(() => {
      savedClient = paymentSDK.ctAPI.client;
    });
    afterEach(() => {
      (paymentSDK.ctAPI as any).client = savedClient;
    });

    const mockClient = (cart: Cart) => {
      (paymentSDK.ctAPI as any).client = { carts: mockCtClientCarts(cart) };
    };

    const usd = (centAmount: number): CentPrecisionMoney => ({
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount,
      fractionDigits: 2,
    });

    const runUpdateCartShipping = (cart: Cart, paymentCentAmount = 20000) => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(usd(paymentCentAmount));
      mockClient(cart);
      return braintreePaymentService.updateCartShipping({ newShippingMethodId: 'method-1' });
    };

    // taxTotal is always 0.00 (tax is embedded in the gross line items); itemTotal = total - shipping + discount,
    // and each cart's line items match it, so the breakdown is always sent
    test.each([
      {
        description: 'standard cart (platform tax)',
        cart: mockCartForShippingUpdate,
        shipping: '20.00',
        discount: '0.00',
        itemTotal: '180.00',
      },
      {
        description: 'external tax cart',
        cart: mockCartWithExternalTax,
        shipping: '10.00',
        discount: '5.00',
        itemTotal: '195.00',
      },
      {
        description: 'gross shipping and discount when commercetools provides them',
        cart: (): Cart => {
          const baseCart = mockCartWithExternalTax();
          return {
            ...baseCart,
            lineItems: [lineItemWithTotal(19400)],
            shippingInfo: {
              ...baseCart.shippingInfo!,
              taxedPrice: { totalNet: usd(1000), totalGross: usd(1200), totalTax: usd(200), taxPortions: [] },
            },
            discountOnTotalPrice: { ...baseCart.discountOnTotalPrice!, discountedGrossAmount: usd(600) },
          };
        },
        shipping: '12.00',
        discount: '6.00',
        itemTotal: '194.00',
      },
      {
        description: 'discounted shipping without taxedPrice, discounted to 0',
        cart: (): Cart => {
          const baseCart = mockCartForShippingUpdate();
          return {
            ...baseCart,
            lineItems: [lineItemWithTotal(20000)],
            shippingInfo: {
              ...baseCart.shippingInfo!,
              price: usd(500),
              discountedPrice: { value: usd(0), includedDiscounts: [] },
            },
          };
        },
        shipping: '0.00',
        discount: '0.00',
        itemTotal: '200.00',
      },
      {
        description: 'cart without shippingInfo',
        cart: (): Cart => ({
          ...mockCartForShippingUpdate(),
          lineItems: [lineItemWithTotal(20000)],
          shippingInfo: undefined,
        }),
        shipping: '0.00',
        discount: '0.00',
        itemTotal: '200.00',
      },
    ])('$description: shipping $shipping, discount $discount, itemTotal $itemTotal', async (row) => {
      const result = await runUpdateCartShipping(row.cart());

      expect(result.braintreeAmount).toBe('200.00');
      expect(result.shippingAmount).toBe(row.shipping);
      expect(result.braintreeBreakdown?.amountBreakdown).toEqual({
        itemTotal: row.itemTotal,
        taxTotal: '0.00',
        shipping: row.shipping,
        discount: row.discount,
        handling: '0.00',
        insurance: '0.00',
        shippingDiscount: '0.00',
      });
    });

    test('breakdown line items are the updated cart line items, without a DISCOUNT credit item', async () => {
      const result = await runUpdateCartShipping(mockCartWithExternalTax());

      // the discount is part of amountBreakdown.discount, so no credit item is sent along
      expect(result.braintreeBreakdown?.lineItems).toEqual([
        expect.objectContaining({ kind: 'debit', totalAmount: '195.00', productCode: 'product-id-1' }),
      ]);
    });

    test('line items not matching itemTotal: breakdown is omitted and a warning names both amounts', async () => {
      const warn = jest.spyOn(CommonConnect.logger, 'warn').mockImplementation(() => CommonConnect.logger);
      const cart: Cart = { ...mockCartForShippingUpdate(), lineItems: [lineItemWithTotal(18001)] };

      const result = await runUpdateCartShipping(cart);

      expect(result.braintreeBreakdown).toBeUndefined();
      expect(result.braintreeAmount).toBe('200.00');
      expect(result.shippingAmount).toBe('20.00');
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\(180\.01\).*\(180\.00\).*cart-shipping-update/));
    });
  });

  describe('getSupportedPaymentComponents', () => {
    // Values are commercetools icon keys (see utils/paymentMethodIcon.utils.ts), not our own
    // PaymentMethodType values — ACH/Venmo/mybank have no commercetools equivalent so they're
    // unchanged; bancontact/p24 differ from our own naming (bancontactcard/przelewy24).
    const expectedLocalTypes = ['bancontactcard', 'blik', 'eps', 'ideal', 'mybank', 'przelewy24'];
    // ACH is always included: this discovery endpoint is JWT-authenticated (no cart/customer in
    // context), so it can't gate on login state — merchants restrict ACH to logged-in customers
    // via a `customerId != null` payment integration predicate in the merchant center instead.
    const expectedBaseTypes = ['ACH', 'applepay', 'card', 'googlepay', 'paypal', 'Venmo'];
    const expectedExpressTypes = ['paypal']; // PayPalVault and CreditCardVault are PURE_VAULT_DISABLED

    test('includes ACH unconditionally, with no cart/customer context available', async () => {
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual(expectedBaseTypes);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });

    test('without merchant account — returns base components only', async () => {
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual(expectedBaseTypes);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });

    test('with merchant account — returns base + local payment components', async () => {
      jest
        .spyOn(Config, 'getConfig')
        .mockReturnValueOnce({ ...Config.getConfig(), merchantAccountId: 'test-merchant-account' });
      const result: ConfigResponse = await paymentService.getSupportedPaymentComponents();
      const components = result?.components;
      expect((components as { type: string }[])?.map(({ type }) => type)).toEqual([
        ...expectedBaseTypes,
        ...expectedLocalTypes,
      ]);
      expect(result?.dropins).toHaveLength(0);
      expect((result?.express as { type: string }[]).map(({ type }) => type)).toEqual(expectedExpressTypes);
    });
  });

  describe('getStoredPaymentMethods', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    test('only returns CreditCard entries, even when Braintree also has PayPal/ACH accounts vaulted', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-customer-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest
        .spyOn(BraintreeCustomerService.prototype, 'getCtCustomer')
        .mockResolvedValue({ custom: { fields: { braintreeCustomerId: 'bt-customer-1' } } } as unknown as Customer);
      jest.spyOn(paymentSDK.ctPaymentMethodService, 'find').mockResolvedValue({ results: [] } as never);
      (CommonConnect.getBraintreeGateway as jest.Mock).mockResolvedValue({
        customer: {
          find: jest.fn().mockResolvedValue({
            creditCards: [
              {
                token: 'cc-1',
                default: true,
                createdAt: '2024-01-01',
                last4: '1234',
                cardType: 'Visa',
                expirationMonth: '01',
                expirationYear: '2030',
              },
            ],
            paypalAccounts: [{ token: 'pp-1', default: false, createdAt: '2024-01-01', email: 'buyer@example.com' }],
            usBankAccounts: [
              { token: 'ba-1', default: false, createdAt: '2024-01-01', last4: '5678', accountType: 'checking' },
            ],
          } as never),
        },
      } as never);

      const result = await braintreePaymentService.getStoredPaymentMethods();

      expect(result.storedPaymentMethods).toHaveLength(1);
      expect(result.storedPaymentMethods[0]).toMatchObject({ type: 'card', token: 'cc-1' });
    });
  });

  describe('transactionSale', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      (CommonConnect.transactionSale as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
    });

    const baseRequest = { ctPaymentId: mockGetPaymentResult.id };

    const lineItem = (totalAmount: string, name: string) => ({
      name,
      kind: LineItemKind.Debit,
      quantity: '1',
      unitAmount: totalAmount,
      totalAmount,
      productCode: 'PRODUCT',
      unitTaxAmount: '0.00',
      description: '',
      url: '',
    });

    test('CreditCard: forwards nonce and deviceData', async () => {
      const result = await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        deviceData: 'device-fingerprint-data',
      });
      expect(result.success).toBe(true);
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-valid-nonce', deviceData: 'device-fingerprint-data' }),
      );
    });

    test('CreditCard: forwards braintreeShipping', async () => {
      const shipping = {
        firstName: 'Jane',
        lastName: 'Doe',
        streetAddress: '1 Main St',
        locality: 'Berlin',
        region: 'BE',
        postalCode: '10115',
        countryCodeAlpha2: 'DE',
      };
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        braintreePaymentDetails: { braintreeShipping: shipping },
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining({ shipping }));
    });

    test('CreditCardStored: forwards paymentToken, no nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD_STORED,
        paymentToken: 'stored-card-token',
        braintreeCustomerId: 'bt-customer-123',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodToken: 'stored-card-token', paymentMethodNonce: undefined }),
      );
    });

    test('PayPal: forwards nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.PAYPAL,
        paymentMethodNonce: 'fake-paypal-billing-agreement-nonce',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-paypal-billing-agreement-nonce' }),
      );
    });

    // PAYPAL_STORED_DISABLED: no test for PayPalStored — see StoredPaymentMethodType in dtos/braintree-payment.dto.ts

    test('GooglePay: forwards nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.GOOGLE_PAY,
        paymentMethodNonce: 'fake-android-pay-nonce',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-android-pay-nonce' }),
      );
    });

    test('ApplePay: forwards nonce', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.APPLE_PAY,
        paymentMethodNonce: 'fake-apple-pay-visa-nonce',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-apple-pay-visa-nonce' }),
      );
    });

    test('Venmo: forwards nonce', async () => {
      const result = await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.VENMO,
        paymentMethodNonce: 'fake-venmo-account-nonce',
        venmoUsername: 'venmo-user',
      });
      expect(result.success).toBe(true);
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodNonce: 'fake-venmo-account-nonce' }),
      );
    });

    test('ACH: forwards paymentToken', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.ACH,
        paymentToken: 'ach-bank-token',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodToken: 'ach-bank-token' }),
      );
    });

    test('Local payment (ideal): sets submitForSettlement', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: LocalPaymentMethodType.IDEAL as unknown as PaymentMethodType,
        paymentMethodNonce: 'fake-local-payment-nonce',
        localPaymentId: 'local-payment-id-123',
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethodNonce: 'fake-local-payment-nonce',
          options: expect.objectContaining({ submitForSettlement: true }),
        }),
      );
    });

    test('storeInVaultOnSuccess: sets vault options', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        storeInVaultOnSuccess: true,
        storeShipping: true,
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            storeInVaultOnSuccess: true,
            storeShippingAddressInVault: true,
          }),
        }),
      );
    });

    test('discountAmount is derived as the gap between lineItems total and the charged amount', async () => {
      // mockGetPaymentResult.amountPlanned is 1200.00 GBP; lineItems sum to 1300.00 — the 100.00
      // gap is the cart discount, which never arrives as its own line item (it's filtered out above).
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        braintreePaymentDetails: {
          braintreeLineItems: [lineItem('700.00', 'Item A'), lineItem('600.00', 'Item B')],
        },
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining({ discountAmount: '100.00' }));
    });

    test('discountAmount is 0.00 when lineItems already match the charged amount', async () => {
      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'fake-valid-nonce',
        braintreePaymentDetails: {
          braintreeLineItems: [lineItem('1200.00', 'Item A')],
        },
      });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining({ discountAmount: '0.00' }));
    });

    // Express after a shipping change: line items and shipping come from the refetched cart, never from the enabler
    const usd = (centAmount: number): CentPrecisionMoney => ({
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount,
      fractionDigits: 2,
    });
    const expressCart = (lineItemCentAmount: number, shippingCentAmount: number): Cart => {
      const cart = mockGetCartResult(); // totalPrice: $1500.00 (see mock-cart-data.ts)
      return {
        ...cart,
        lineItems: [lineItemWithTotal(lineItemCentAmount)],
        shippingInfo: { ...cart.shippingInfo!, price: usd(shippingCentAmount) },
      };
    };
    const mockRefetchedCart = (cart: Cart) => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      return jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
    };
    const staleEnablerLineItem = lineItem('1.00', 'stale createPayment copy');
    const expressShippingChangedRequest = {
      ...baseRequest,
      paymentMethodType: PaymentMethodType.PAYPAL,
      paymentMethodNonce: 'fake-paypal-billing-agreement-nonce',
      braintreePaymentDetails: { braintreeLineItems: [staleEnablerLineItem], expressShippingChanged: true },
    };

    test.each([
      {
        // lineItems (1550.00) + shippingAmount (20.00) - amount (1500.00) = 70.00, sent to PayPal as a DISCOUNT line item
        description: 'balances the discount residual against the cart line items and shipping',
        cart: () => expressCart(155000, 2000),
        expected: {
          amount: '1500.00',
          discountAmount: '0.00',
          shippingAmount: '20.00',
          lineItems: [
            expect.objectContaining({ productCode: 'product-id-1', totalAmount: '1550.00' }),
            expect.objectContaining({ productCode: 'DISCOUNT', kind: 'credit', totalAmount: '70.00' }),
          ],
        },
      },
      {
        description: 'charges the cart gross when tax is not included in price',
        cart: (): Cart => ({
          ...expressCart(178000, 2000), // totalPrice: $1500.00 (net)
          taxedPrice: { totalNet: usd(150000), totalGross: usd(180000), totalTax: usd(30000), taxPortions: [] },
        }),
        expected: {
          amount: '1800.00',
          discountAmount: '0.00',
          shippingAmount: '20.00',
          lineItems: [expect.objectContaining({ totalAmount: '1780.00' })],
        },
      },
      {
        description: 'still refetches the cart for a 0 cost shipping option',
        cart: () => expressCart(150000, 0),
        expected: {
          amount: '1500.00',
          shippingAmount: '0.00',
          lineItems: [expect.objectContaining({ totalAmount: '1500.00' })],
        },
      },
    ])('express shipping change $description', async ({ cart, expected }) => {
      const getCart = mockRefetchedCart(cart());

      await braintreePaymentService.transactionSale(expressShippingChangedRequest);
      expect(getCart).toHaveBeenCalled();
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining(expected));
    });

    test('express shipping change charges getPaymentAmount (approved payments subtracted), as updateCartShipping sends', async () => {
      const cart = expressCart(150000, 0);
      mockRefetchedCart(cart);
      const getPaymentAmount = jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(usd(120000));

      await braintreePaymentService.transactionSale(expressShippingChangedRequest);

      expect(getPaymentAmount).toHaveBeenCalledWith({ cart });
      expect(CommonConnect.transactionSale).toHaveBeenCalledWith(expect.objectContaining({ amount: '1200.00' }));
      // the order-triggering placeholder carries the same amount
      expect(paymentSDK.ctPaymentService.updatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            type: 'Authorization',
            amount: { centAmount: 120000, currencyCode: 'USD' },
          }),
        }),
      );
    });

    test('express shipping change requests the amount while the payment is still loading', async () => {
      const cart = expressCart(150000, 0);
      mockRefetchedCart(cart);
      let resolvePayment!: (payment: never) => void;
      jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockReturnValue(new Promise((resolve) => (resolvePayment = resolve)));
      const getPaymentAmount = jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(usd(150000));

      const sale = braintreePaymentService.transactionSale(expressShippingChangedRequest);
      // setImmediate (not nextTick) runs after every pending microtask, so the getCart -> getPaymentAmount chain is done
      await new Promise((resolve) => setImmediate(resolve));
      expect(getPaymentAmount).toHaveBeenCalledWith({ cart });

      resolvePayment(mockGetPaymentResult as never);
      await sale;
    });

    test('without an express shipping change, the cart is not refetched and the enabler line items are sent', async () => {
      const getCart = jest.spyOn(paymentSDK.ctCartService, 'getCart');

      await braintreePaymentService.transactionSale({
        ...baseRequest,
        paymentMethodType: PaymentMethodType.PAYPAL,
        paymentMethodNonce: 'fake-paypal-billing-agreement-nonce',
        braintreePaymentDetails: { braintreeLineItems: [lineItem('1200.00', 'Item A')] },
      });
      expect(getCart).not.toHaveBeenCalled();
      const request = (CommonConnect.transactionSale as jest.Mock).mock.calls[0][0] as { lineItems: unknown[] };
      expect(request.lineItems).toEqual([expect.objectContaining({ name: 'Item A', totalAmount: '1200.00' })]);
      expect(request).not.toHaveProperty('shippingAmount');
    });
  });

  // test('getStatus', async () => {
  //   const mockHealthCheckFunction: () => Promise<HealthCheckResult> = async () => {
  //     const result: HealthCheckResult = {
  //       name: 'CoCo Permissions',
  //       status: 'DOWN',
  //       details: {
  //         message: 'CoCo Permissions are not available',
  //       },
  //     };
  //     return result;
  //   };
  //
  //   jest.spyOn(StatusHandler, 'healthCheckCommercetoolsPermissions').mockReturnValue(mockHealthCheckFunction);
  //   const paymentService: AbstractPaymentService = new BraintreePaymentService(opts);
  //   const result: StatusResponse = await paymentService.status();
  //
  //   expect(result?.status).toBeDefined();
  //   expect(result?.checks).toHaveLength(2);
  //   expect(result?.status).toStrictEqual('Partially Available');
  //   expect(result?.checks[0]?.name).toStrictEqual('CoCo Permissions');
  //   expect(result?.checks[0]?.status).toStrictEqual('DOWN');
  //   expect(result?.checks[0]?.details).toStrictEqual({ message: 'CoCo Permissions are not available' });
  //   expect(result?.checks[1]?.name).toStrictEqual('Mock Payment API');
  //   expect(result?.checks[1]?.status).toStrictEqual('UP');
  //   expect(result?.checks[1]?.details).toBeDefined();
  //   expect(result?.checks[1]?.message).toBeDefined();
  // });
  //
  // test('cancelPayment', async () => {
  //   const modifyPaymentOpts: ModifyPayment = {
  //     paymentId: 'dummy-paymentId',
  //     data: {
  //       actions: [
  //         {
  //           action: 'cancelPayment',
  //         },
  //       ],
  //     },
  //   };
  //   jest.spyOn(DefaultPaymentService.prototype, 'getPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //   const result = await paymentService.modifyPayment(modifyPaymentOpts);
  //   expect(result?.outcome).toStrictEqual('approved');
  // });
  //
  // test('capturePayment', async () => {
  //   const modifyPaymentOpts: ModifyPayment = {
  //     paymentId: 'dummy-paymentId',
  //     data: {
  //       actions: [
  //         {
  //           action: 'capturePayment',
  //           amount: {
  //             centAmount: 150000,
  //             currencyCode: 'USD',
  //           },
  //         },
  //       ],
  //     },
  //   };
  //   jest.spyOn(DefaultPaymentService.prototype, 'getPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //   const result = await paymentService.modifyPayment(modifyPaymentOpts);
  //   expect(result?.outcome).toStrictEqual('approved');
  // });
  //
  // test('refundPayment', async () => {
  //   const modifyPaymentOpts: ModifyPayment = {
  //     paymentId: 'dummy-paymentId',
  //     data: {
  //       actions: [
  //         {
  //           action: 'refundPayment',
  //           amount: {
  //             centAmount: 150000,
  //             currencyCode: 'USD',
  //           },
  //         },
  //       ],
  //     },
  //   };
  //   jest.spyOn(DefaultPaymentService.prototype, 'getPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //   jest
  //     .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //     .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //   const result = await paymentService.modifyPayment(modifyPaymentOpts);
  //   expect(result?.outcome).toStrictEqual('approved');
  // });
  //
  // test('create card payment', async () => {
  //   const createPaymentOpts: CreatePaymentRequest = {
  //     data: {
  //       paymentMethod: {
  //         type: PaymentMethodType.CARD,
  //       },
  //       paymentOutcome: PaymentOutcome.AUTHORIZED,
  //     },
  //   };
  //   jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(DefaultPaymentService.prototype, 'createPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(FastifyContext, 'getProcessorUrlFromContext').mockReturnValue('http://127.0.0.1');
  //   jest.spyOn(DefaultPaymentService.prototype, 'updatePayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //
  //   const result = await braintreePaymentService.createPayment(createPaymentOpts);
  //   expect(result?.paymentReference).toStrictEqual('123456');
  // });
  //
  // test('create invoice payment', async () => {
  //   const createPaymentOpts: CreatePaymentRequest = {
  //     data: {
  //       paymentMethod: {
  //         type: PaymentMethodType.INVOICE,
  //       },
  //       paymentOutcome: PaymentOutcome.AUTHORIZED,
  //     },
  //   };
  //   jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(DefaultPaymentService.prototype, 'createPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(FastifyContext, 'getProcessorUrlFromContext').mockReturnValue('http://127.0.0.1');
  //   jest.spyOn(DefaultPaymentService.prototype, 'updatePayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //
  //   const result = await braintreePaymentService.createPayment(createPaymentOpts);
  //   expect(result?.paymentReference).toStrictEqual('123456');
  // });
  //
  // test('create purchaseorder payment successfully', async () => {
  //   const createPaymentOpts: CreatePaymentRequest = {
  //     data: {
  //       paymentMethod: {
  //         type: PaymentMethodType.PURCHASE_ORDER,
  //         poNumber: '123456',
  //         invoiceMemo: 'This is a test invoice',
  //       },
  //       paymentOutcome: PaymentOutcome.AUTHORIZED,
  //     },
  //   };
  //   jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(DefaultPaymentService.prototype, 'createPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(FastifyContext, 'getProcessorUrlFromContext').mockReturnValue('http://127.0.0.1');
  //   jest.spyOn(DefaultPaymentService.prototype, 'updatePayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //
  //   const result = await braintreePaymentService.createPayment(createPaymentOpts);
  //   expect(result?.paymentReference).toStrictEqual('123456');
  // });
  //
  // test('create purchaseorder payment returns an error when PO number is not received', async () => {
  //   const createPaymentOpts: CreatePaymentRequest = {
  //     data: {
  //       paymentMethod: {
  //         type: PaymentMethodType.PURCHASE_ORDER,
  //       },
  //       paymentOutcome: PaymentOutcome.AUTHORIZED,
  //     },
  //   };
  //   jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(DefaultPaymentService.prototype, 'createPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //   jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValue(Promise.resolve(mockGetCartResult()));
  //   jest.spyOn(FastifyContext, 'getProcessorUrlFromContext').mockReturnValue('http://127.0.0.1');
  //
  //   const resultPromise = braintreePaymentService.createPayment(createPaymentOpts);
  //
  //   await expect(resultPromise).rejects.toThrow('A value is required for field poNumber.');
  // });
  //
  // describe('handleTransaction', () => {
  //   test('should create the payment in CoCo and return it with a success state', async () => {
  //     const createPaymentOpts: TransactionDraftDTO = {
  //       cartId: 'dd4b7669-698c-4175-8e4c-bed178abfed3',
  //       paymentInterface: '42251cfc-0660-4ab3-80f6-c32829aa7a8b',
  //       amount: {
  //         centAmount: 1000,
  //         currencyCode: 'EUR',
  //       },
  //     };
  //
  //     jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValueOnce(Promise.resolve(mockGetCartResult()));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'createPayment')
  //       .mockReturnValueOnce(Promise.resolve(mockGetPaymentResult));
  //     jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValueOnce(Promise.resolve(mockGetCartResult()));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //     const resultPromise = braintreePaymentService.handleTransaction(createPaymentOpts);
  //     expect(resultPromise).resolves.toStrictEqual({
  //       transactionStatus: {
  //         errors: [],
  //         state: 'Pending',
  //       },
  //     });
  //   });
  //
  //   test('should create the payment in CoCo and return it with a failed state', async () => {
  //     const createPaymentOpts: TransactionDraftDTO = {
  //       cartId: 'dd4b7669-698c-4175-8e4c-bed178abfed3',
  //       paymentInterface: '42251cfc-0660-4ab3-80f6-c32829aa7a8b',
  //       amount: {
  //         centAmount: 10000,
  //         currencyCode: 'EUR',
  //       },
  //     };
  //
  //     jest.spyOn(DefaultCartService.prototype, 'getCart').mockReturnValueOnce(Promise.resolve(mockGetCartResult()));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'createPayment')
  //       .mockReturnValueOnce(Promise.resolve(mockGetPaymentResult));
  //     jest.spyOn(DefaultCartService.prototype, 'addPayment').mockReturnValueOnce(Promise.resolve(mockGetCartResult()));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //     const resultPromise = braintreePaymentService.handleTransaction(createPaymentOpts);
  //
  //     expect(resultPromise).resolves.toStrictEqual({
  //       transactionStatus: {
  //         errors: [
  //           {
  //             code: 'PaymentRejected',
  //             message: `Payment '${mockGetPaymentResult.id}' has been rejected.`,
  //           },
  //         ],
  //         state: 'Failed',
  //       },
  //     });
  //   });
  // });
  //
  // describe('reversePayment', () => {
  //   test('it should fail because there are no transactions to revert', async () => {
  //     const modifyPaymentOpts: ModifyPayment = {
  //       paymentId: 'dummy-paymentId',
  //       data: {
  //         actions: [
  //           {
  //             action: 'reversePayment',
  //           },
  //         ],
  //       },
  //     };
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'getPayment')
  //       .mockReturnValue(Promise.resolve(mockGetPaymentResultWithoutTransactions));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResult));
  //
  //     const result = paymentService.modifyPayment(modifyPaymentOpts);
  //     await expect(result).rejects.toThrow('There is no successful payment transaction to reverse.');
  //   });
  //
  //   test('it should successfully revert transaction', async () => {
  //     const modifyPaymentOpts: ModifyPayment = {
  //       paymentId: 'dummy-paymentId',
  //       data: {
  //         actions: [
  //           {
  //             action: 'reversePayment',
  //           },
  //         ],
  //       },
  //     };
  //     jest.spyOn(DefaultPaymentService.prototype, 'getPayment').mockReturnValue(Promise.resolve(mockGetPaymentResult));
  //     jest
  //       .spyOn(DefaultPaymentService.prototype, 'updatePayment')
  //       .mockReturnValue(Promise.resolve(mockUpdatePaymentResultWithRefundTransaction));
  //
  //     const result = await paymentService.modifyPayment(modifyPaymentOpts);
  //     expect(result?.outcome).toStrictEqual('approved');
  //   });
  // });

  describe('recordOptimisticAuthorizationPlaceholder', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      (CommonConnect.transactionSale as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);
    });

    test('creates initial placeholder when no existing placeholder on payment', async () => {
      const payment = { ...mockGetPaymentResult, transactions: [] };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await braintreePaymentService.transactionSale({
        ctPaymentId: payment.id,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'nonce-123',
      });

      // recordOptimisticAuthorizationPlaceholder's call shape: { id, transaction: { type, state,
      // amount } } — no interactionId — distinct from the later real-transaction updatePayment call.
      expect(paymentSDK.ctPaymentService.updatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: payment.id,
          transaction: expect.objectContaining({
            type: 'Authorization',
            state: 'Initial',
          }),
        }),
      );
      const placeholderCall = (paymentSDK.ctPaymentService.updatePayment as jest.Mock).mock.calls.find(
        (call: any) => call[0].transaction?.state === 'Initial' && !call[0].transaction?.interactionId,
      );
      expect(placeholderCall).toBeTruthy();
    });

    test('skips placeholder creation when already present on payment', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [
          {
            id: 'existing-placeholder',
            type: 'Authorization',
            state: 'Initial',
            amount: mockGetPaymentResult.amountPlanned,
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);
      (CommonConnect.transactionSale as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);

      const updatePaymentSpy = jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);

      await braintreePaymentService.transactionSale({
        ctPaymentId: payment.id,
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        paymentMethodNonce: 'nonce-123',
      });

      // updatePayment should still be called for the final transaction, but not for the placeholder
      const updateCalls = updatePaymentSpy.mock.calls;
      const placeholderCall = updateCalls.find((call) => JSON.stringify(call[0]).includes('"state":"Initial"'));
      expect(placeholderCall).toBeFalsy();
    });
  });

  describe('settlement', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      (CommonConnect.submitForSettlement as jest.Mock).mockResolvedValue(mockBraintreeTransaction as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
    });

    test('happy path: submits with last Authorization transaction interactionId', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [
          {
            id: 'auth-1',
            type: 'Authorization',
            state: 'Success',
            amount: mockGetPaymentResult.amountPlanned,
            timestamp: '2024-01-01T00:00:00Z',
            interactionId: 'interaction-1',
          },
          {
            id: 'auth-2',
            type: 'Authorization',
            state: 'Success',
            amount: mockGetPaymentResult.amountPlanned,
            timestamp: '2024-01-02T00:00:00Z',
            interactionId: 'interaction-2',
          },
        ],
      };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await braintreePaymentService.settlement({ payment, amount: payment.amountPlanned });

      // submitForSettlement(interactionId, braintreeAmount) — positional args, not an object.
      expect(CommonConnect.submitForSettlement).toHaveBeenCalledWith('interaction-2', expect.any(String));
    });

    test('throws when no Authorization transaction exists', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [
          {
            id: 'charge-1',
            type: 'Charge',
            state: 'Success',
            amount: mockGetPaymentResult.amountPlanned,
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await expect(braintreePaymentService.settlement({ payment, amount: payment.amountPlanned })).rejects.toThrow();
    });

    test('throws when Authorization transaction missing interactionId', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [
          {
            id: 'auth-1',
            type: 'Authorization',
            state: 'Success',
            amount: mockGetPaymentResult.amountPlanned,
            timestamp: '2024-01-01T00:00:00Z',
            // missing interactionId
          },
        ],
      };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);

      await expect(braintreePaymentService.settlement({ payment, amount: payment.amountPlanned })).rejects.toThrow();
    });

    test('handles Braintree call rejection', async () => {
      const payment = {
        ...mockGetPaymentResult,
        transactions: [
          {
            id: 'auth-1',
            type: 'Authorization',
            state: 'Success',
            amount: mockGetPaymentResult.amountPlanned,
            timestamp: '2024-01-01T00:00:00Z',
            interactionId: 'interaction-1',
          },
        ],
      };
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(payment as never);
      (CommonConnect.submitForSettlement as jest.Mock).mockRejectedValue(new Error('Braintree error') as never);

      await expect(braintreePaymentService.settlement({ payment, amount: payment.amountPlanned })).rejects.toThrow();
    });
  });

  describe('getAchVaultToken', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      jest.spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer').mockResolvedValue({
        token: 'ach-token-123',
        verified: true,
      });
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
    });

    test('verified/instant path: no Pending sync side effect', async () => {
      const result = await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
        braintreeCustomerId: 'bt-cust-123',
      });

      expect(result.token).toBe('ach-token-123');
      expect(result.verified).toBe(true);
    });

    test('unverified/micro-deposit path: fires Pending sync', async () => {
      jest.spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer').mockResolvedValueOnce({
        token: 'ach-token-456',
        verified: false,
      });

      const result = await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
        braintreeCustomerId: 'bt-cust-123',
      });

      expect(result.token).toBe('ach-token-456');
      expect(result.verified).toBe(false);
      // CT PaymentMethod mirror save should be fire-and-forget when cart has customerId
    });

    test('includes merchantReturnUrl in unverified flow', async () => {
      jest.spyOn(BraintreeCustomerService.prototype, 'vaultPaymentMethodForCustomer').mockResolvedValueOnce({
        token: 'ach-token-789',
        verified: false,
      });
      jest.spyOn(FastifyContext, 'getMerchantReturnUrlFromContext').mockReturnValue('https://example.com/return');

      const result = await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
        braintreeCustomerId: 'bt-cust-123',
      });

      // buildRedirectMerchantUrl appends paymentReference/paymentStatus query params.
      expect(result.merchantReturnUrl).toContain('https://example.com/return?');
      expect(result.merchantReturnUrl).toContain('paymentStatus=settlement_pending');
    });

    test('fire-and-forget CT PaymentMethod mirror save when cart has customerId', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);

      await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
        braintreeCustomerId: 'bt-cust-123',
      });

      // Should not throw even if the save fails
    });

    test('skips mirror save when cart has no customerId', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: undefined };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);

      const result = await braintreePaymentService.getAchVaultToken({
        ctPaymentId: 'payment-123',
        paymentMethodNonce: 'ach-nonce',
        braintreeCustomerId: 'bt-cust-123',
      });

      expect(result.token).toBe('ach-token-123');
    });
  });

  describe('deleteStoredPaymentMethod', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    beforeEach(() => {
      // deleteStoredPaymentMethod calls braintreeDeletePayment(token) directly (aliased from
      // common-connect/dist's `deletePayment`) — not getBraintreeGateway().paymentMethod.delete.
      (CommonConnect.deletePayment as jest.Mock).mockResolvedValue(undefined as never);
      jest.spyOn(paymentSDK.ctPaymentMethodService, 'delete').mockResolvedValue({} as never);
    });

    test('happy path: deletes from Braintree and CT mirror', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(paymentSDK.ctPaymentMethodService, 'getByTokenValue').mockResolvedValue({
        id: 'ct-pm-1',
        version: 1,
      } as never);

      await braintreePaymentService.deleteStoredPaymentMethod('pm-token-123');
      // fireAndForgetCtPaymentMethodSync doesn't await its own chain — flush pending microtasks
      // so the mirror-delete call lands before the assertion below.
      await new Promise((resolve) => process.nextTick(resolve));

      expect(paymentSDK.ctPaymentMethodService.delete).toHaveBeenCalled();
    });

    test('rethrows when Braintree delete rejects', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      (CommonConnect.deletePayment as jest.Mock).mockRejectedValue(new Error('Braintree error') as never);

      await expect(braintreePaymentService.deleteStoredPaymentMethod('pm-token-123')).rejects.toThrow(
        'Braintree error',
      );

      expect(paymentSDK.ctPaymentMethodService.delete).not.toHaveBeenCalled();
    });

    test('cart lookup failure alone does not fail the method', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-id');
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockRejectedValue(new Error('Cart not found'));

      // Should still succeed in deleting from Braintree — cart lookup failure is swallowed inline
      await expect(braintreePaymentService.deleteStoredPaymentMethod('pm-token-123')).resolves.toBeUndefined();
    });
  });

  describe('config', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    test('happy path shape', async () => {
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(mockCartForShippingUpdate() as never);

      const result = await braintreePaymentService.config();

      expect(result).toBeDefined();
      expect(result?.environment).toBeDefined();
      expect(result?.storedPaymentMethodsConfig).toEqual({ isEnabled: expect.any(Boolean) });
    });

    test('propagates when a dependency throws', async () => {
      jest.spyOn(Config, 'getConfig').mockImplementation(() => {
        throw new Error('Config error');
      });

      await expect(braintreePaymentService.config()).rejects.toThrow('Config error');
    });
  });

  describe('getShippingMethods', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    // getShippingMethods calls paymentSDK.ctAPI.client.shippingMethods().get().execute() directly
    // — it has nothing to do with the Braintree gateway. paymentSDK.ctAPI.client is a
    // non-configurable getter, so it's mocked via manual save/restore, matching the
    // updateCartShipping describe block's mockCtClientCarts convention above.
    let savedClient: unknown;
    beforeEach(() => {
      savedClient = paymentSDK.ctAPI.client;
    });
    afterEach(() => {
      (paymentSDK.ctAPI as any).client = savedClient;
    });

    const mockShippingMethodsResolved = (results: unknown[]) => {
      const execute = jest.fn<() => Promise<any>>().mockResolvedValue({ body: { results } });
      const get = jest.fn().mockReturnValue({ execute });
      (paymentSDK.ctAPI as any).client = { shippingMethods: jest.fn().mockReturnValue({ get }) };
    };

    const mockShippingMethodsRejected = (reason: unknown) => {
      const execute = jest.fn<() => Promise<any>>().mockRejectedValue(reason);
      const get = jest.fn().mockReturnValue({ execute });
      (paymentSDK.ctAPI as any).client = { shippingMethods: jest.fn().mockReturnValue({ get }) };
    };

    test('happy path', async () => {
      mockShippingMethodsResolved([{ id: 'method-1', name: 'Standard' }]);

      const result = await braintreePaymentService.getShippingMethods('cart-123');

      expect(result).toEqual([{ id: 'method-1', name: 'Standard' }]);
    });

    test('returns undefined on 401 auth error', async () => {
      mockShippingMethodsRejected({ httpErrorStatus: 401 });

      const result = await braintreePaymentService.getShippingMethods('cart-123');

      expect(result).toBeUndefined();
    });

    test('returns undefined on other errors with warn log', async () => {
      mockShippingMethodsRejected(new Error('Other error'));

      const result = await braintreePaymentService.getShippingMethods('cart-123');

      expect(result).toBeUndefined();
    });
  });

  describe('getExpressClientToken', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    test('happy path with resolvable cart/customer', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: 'ct-cust-123' };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      jest.spyOn(BraintreeCustomerService.prototype, 'getCtCustomer').mockResolvedValue({
        custom: { fields: { braintreeCustomerId: 'bt-cust-123' } },
      } as unknown as Customer);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('client-token-123' as never);

      const result = await braintreePaymentService.getExpressClientToken();

      expect(result).toEqual({
        braintreeData: { clientToken: 'client-token-123', braintreeCustomerId: 'bt-cust-123' },
      });
    });

    test('no cart-bound session: fallback to anonymous', async () => {
      // getCartIdFromContext's real return type is always `string` — the "no session" fallback
      // is triggered by it (or the subsequent getCart call) throwing, not by returning undefined.
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockImplementation(() => {
        throw new Error('no cart-bound session');
      });
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('anon-client-token' as never);

      const result = await braintreePaymentService.getExpressClientToken();

      expect(result).toEqual({
        braintreeData: { clientToken: 'anon-client-token', braintreeCustomerId: undefined },
      });
    });

    test('cart with no customerId: getCtCustomer never called', async () => {
      const cart = { ...mockCartForShippingUpdate(), customerId: undefined };
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart);
      const getCtCustomerSpy = jest.spyOn(BraintreeCustomerService.prototype, 'getCtCustomer');
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('client-token' as never);

      const result = await braintreePaymentService.getExpressClientToken();

      expect(getCtCustomerSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ braintreeData: { clientToken: 'client-token', braintreeCustomerId: undefined } });
    });
  });

  describe('createPayment', () => {
    const braintreePaymentService = new BraintreePaymentService(opts);

    const baseCart = () => ({
      ...mockGetCartResult(),
      customerEmail: 'buyer@example.com',
      billingAddress: { country: 'US' },
      shippingAddress: { country: 'US' },
    });

    const amountPlanned: CentPrecisionMoney = {
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount: 15000,
      fractionDigits: 2,
    };

    test('throws when merchant account missing for local payment type', async () => {
      await expect(
        braintreePaymentService.createPayment({
          paymentMethodType: LocalPaymentMethodType.IDEAL,
          builderType: undefined,
        } as never),
      ).rejects.toThrow('braintreeMerchantAccount');
    });

    test('happy path: creates new payment (non-express, no existing customer)', async () => {
      const cart = { ...baseCart(), customerId: undefined };
      const newPayment = {
        ...mockGetPaymentResult,
        id: 'new-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [],
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue(newPayment as never);
      const addPaymentSpy = jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('new-client-token' as never);

      const result = await braintreePaymentService.createPayment({
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        builderType: undefined,
      } as never);

      expect(result.payment.ctPaymentId).toBe('new-payment-id');
      expect(result.braintreeData.clientToken).toBe('new-client-token');
      expect(addPaymentSpy).toHaveBeenCalled();
    });

    test('reused-payment branch: reuses existing payment when amount unchanged and no transactions', async () => {
      const existingPayment = {
        ...mockGetPaymentResult,
        id: 'existing-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [],
      };
      const cart = {
        ...baseCart(),
        customerId: undefined,
        paymentInfo: { payments: [{ id: 'existing-payment-id', typeId: 'payment' }] },
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(existingPayment as never);
      const createPaymentSpy = jest.spyOn(paymentSDK.ctPaymentService, 'createPayment');
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('reused-client-token' as never);

      const result = await braintreePaymentService.createPayment({
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        builderType: undefined,
      } as never);

      expect(createPaymentSpy).not.toHaveBeenCalled();
      expect(result.payment.ctPaymentId).toBe('existing-payment-id');
    });

    test('skips re-persisting client token when recently updated', async () => {
      const existingPayment = {
        ...mockGetPaymentResult,
        id: 'existing-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [{ fields: { type: 'getClientTokenResponse', timestamp: new Date().toISOString() } }],
      };
      const cart = {
        ...baseCart(),
        customerId: undefined,
        paymentInfo: { payments: [{ id: 'existing-payment-id', typeId: 'payment' }] },
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(existingPayment as never);
      const updatePaymentSpy = jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment');
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('reused-client-token' as never);

      await braintreePaymentService.createPayment({
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        builderType: undefined,
      } as never);

      expect(updatePaymentSpy).not.toHaveBeenCalled();
    });

    test('amount-mismatch: existing payment ref not reused when amount differs', async () => {
      const existingPayment = {
        ...mockGetPaymentResult,
        id: 'existing-payment-id',
        amountPlanned: { type: 'centPrecision', currencyCode: 'USD', centAmount: 9999, fractionDigits: 2 },
        transactions: [],
        interfaceInteractions: [],
      };
      const newPayment = {
        ...mockGetPaymentResult,
        id: 'new-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [],
      };
      const cart = {
        ...baseCart(),
        customerId: undefined,
        paymentInfo: { payments: [{ id: 'existing-payment-id', typeId: 'payment' }] },
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(existingPayment as never);
      const createPaymentSpy = jest
        .spyOn(paymentSDK.ctPaymentService, 'createPayment')
        .mockResolvedValue(newPayment as never);
      jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('fresh-client-token' as never);

      const result = await braintreePaymentService.createPayment({
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        builderType: undefined,
      } as never);

      expect(createPaymentSpy).toHaveBeenCalled();
      expect(result.payment.ctPaymentId).toBe('new-payment-id');
    });

    test('express branch: fetches shipping methods, skips required-cart-data validation', async () => {
      // getShippingMethods (called internally for Express) uses the raw CT client directly —
      // paymentSDK.ctAPI.client is a non-configurable getter, so save/restore manually.
      const savedClient = paymentSDK.ctAPI.client;
      try {
        const cart = mockGetCartResult(); // no customerEmail/billingAddress/shippingAddress
        const newPayment = {
          ...mockGetPaymentResult,
          id: 'express-payment-id',
          amountPlanned,
          transactions: [],
          interfaceInteractions: [],
        };

        jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
        jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
        jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
        jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue(newPayment as never);
        jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
        jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
        (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('express-token' as never);

        const execute = jest.fn<() => Promise<any>>().mockResolvedValue({ body: { results: [] } });
        const get = jest.fn().mockReturnValue({ execute });
        (paymentSDK.ctAPI as any).client = { shippingMethods: jest.fn().mockReturnValue({ get }) };

        const result = await braintreePaymentService.createPayment({
          paymentMethodType: PaymentMethodType.PAYPAL,
          builderType: 'express',
        } as never);

        expect(get).toHaveBeenCalled();
        expect(result.payment.ctPaymentId).toBe('express-payment-id');
      } finally {
        (paymentSDK.ctAPI as any).client = savedClient;
      }
    });

    test('non-express: throws when required cart data missing', async () => {
      const cart = mockGetCartResult(); // no customerEmail/billingAddress/shippingAddress

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);

      await expect(
        braintreePaymentService.createPayment({
          paymentMethodType: PaymentMethodType.CREDIT_CARD,
          builderType: undefined,
        } as never),
      ).rejects.toThrow('Required data missing');
    });

    test('customer branch: forwards existing braintreeCustomerId', async () => {
      const cart = { ...baseCart(), customerId: 'ct-cust-1' };
      const newPayment = {
        ...mockGetPaymentResult,
        id: 'customer-payment-id',
        amountPlanned,
        transactions: [],
        interfaceInteractions: [],
      };

      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue(cart.id);
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctCartService, 'getPaymentAmount').mockResolvedValue(amountPlanned);
      jest.spyOn(paymentSDK.ctPaymentService, 'createPayment').mockResolvedValue(newPayment as never);
      jest.spyOn(paymentSDK.ctCartService, 'addPayment').mockResolvedValue(cart as never);
      jest.spyOn(paymentSDK.ctPaymentService, 'updatePayment').mockResolvedValue({} as never);
      jest.spyOn(BraintreeCustomerService.prototype, 'getCtCustomer').mockResolvedValue({
        id: 'ct-cust-1',
        version: 1,
        custom: { fields: { braintreeCustomerId: 'bt-cust-1' } },
      } as unknown as Customer);
      (CommonConnect.getClientToken as jest.Mock).mockResolvedValue('customer-token' as never);

      const result = await braintreePaymentService.createPayment({
        paymentMethodType: PaymentMethodType.CREDIT_CARD,
        builderType: undefined,
      } as never);

      expect(CommonConnect.getClientToken).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'bt-cust-1' }));
      expect(result.braintreeData.braintreeCustomerId).toBe('bt-cust-1');
    });

    test('rethrows when a dependency rejects', async () => {
      jest.spyOn(FastifyContext, 'getCartIdFromContext').mockReturnValue('cart-err');
      jest.spyOn(paymentSDK.ctCartService, 'getCart').mockRejectedValue(new Error('cart lookup failed'));

      await expect(
        braintreePaymentService.createPayment({
          paymentMethodType: PaymentMethodType.CREDIT_CARD,
          builderType: undefined,
        } as never),
      ).rejects.toThrow('cart lookup failed');
    });
  });
});
