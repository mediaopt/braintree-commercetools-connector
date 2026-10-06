import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BraintreePaymentService } from '../../src/services/braintree-payment.service';
import { paymentSDK } from '../../src/payment-sdk';
import { ErrorInvalidOperation } from '@commercetools/connect-payments-sdk';
import { mockGetPaymentResult } from '../utils/mock-payment-results';
import { CentPrecisionMoney } from '@commercetools/platform-sdk';
import { PaymentModificationStatus } from '../../src/dtos/operations/payment-intents.dto';
import { logger } from 'common-connect/dist';
import { mockCustomTypeLookup } from '../utils/mock-custom-type-lookup';
import { nonBraintreeCustomCases } from '../utils/mock-custom-types';
import { notBraintreePayment } from '../../src/utils/customEntities.utils';

jest.mock('common-connect/dist', () => ({
  ...(jest.requireActual('common-connect/dist') as object),
  transactionSale: jest.fn(),
  getBraintreeGateway: jest.fn(),
}));

describe('abstract-payment.service (modifyPayment)', () => {
  const opts = {
    ctCartService: paymentSDK.ctCartService,
    ctPaymentService: paymentSDK.ctPaymentService,
    ctPaymentMethodService: paymentSDK.ctPaymentMethodService,
  };
  const paymentService = new BraintreePaymentService(opts);

  beforeEach(() => {
    jest.setTimeout(10000);
    jest.resetAllMocks();
    mockCustomTypeLookup();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('modifyPayment', () => {
    const amount: CentPrecisionMoney = {
      type: 'centPrecision',
      currencyCode: 'USD',
      centAmount: 10000,
      fractionDigits: 2,
    };

    beforeEach(() => {
      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(mockGetPaymentResult as never);
    });

    test('capturePayment action calls settlement with payment and amount', async () => {
      const settlementSpy = jest
        .spyOn(paymentService, 'settlement')
        .mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: {
          actions: [{ action: 'capturePayment', amount }],
        },
      });

      expect(settlementSpy).toHaveBeenCalledWith({
        payment: mockGetPaymentResult,
        amount,
      });
    });

    test('capturePayment passes merchantReference on as the target Authorization', async () => {
      const settlementSpy = jest
        .spyOn(paymentService, 'settlement')
        .mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: { actions: [{ action: 'capturePayment', amount, merchantReference: 'txn-auth' }] },
      });

      expect(settlementSpy).toHaveBeenCalledWith({
        payment: mockGetPaymentResult,
        amount,
        merchantReference: 'txn-auth',
      });
    });

    // checked before the action switch, so nothing reaches Braintree
    test.each(nonBraintreeCustomCases)(
      'payment with $description: rejected and logged as error, no operation runs',
      async ({ custom }) => {
        jest
          .spyOn(paymentSDK.ctPaymentService, 'getPayment')
          .mockResolvedValue({ ...mockGetPaymentResult, custom } as never);
        const settlementSpy = jest.spyOn(paymentService, 'settlement');
        const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

        const result = await paymentService.modifyPayment({
          paymentId: mockGetPaymentResult.id,
          data: { actions: [{ action: 'capturePayment', amount }] },
        });

        expect(result).toEqual({ outcome: PaymentModificationStatus.REJECTED });
        expect(settlementSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(notBraintreePayment(mockGetPaymentResult.id)));
      },
    );

    test('cancelPayment action calls void with payment', async () => {
      const voidSpy = jest
        .spyOn(paymentService, 'void')
        .mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: {
          actions: [{ action: 'cancelPayment' }],
        },
      });

      expect(voidSpy).toHaveBeenCalledWith({
        payment: mockGetPaymentResult,
      });
    });

    test.each([
      ['cancelPayment', 'void'],
      ['reversePayment', 'reversePayment'],
    ] as const)('%s passes merchantReference on as the target', async (action, method) => {
      const spy = jest.spyOn(paymentService, method).mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: { actions: [{ action, merchantReference: 'txn-child' }] },
      });

      expect(spy).toHaveBeenCalledWith({ payment: mockGetPaymentResult, merchantReference: 'txn-child' });
    });

    test('refundPayment action calls refundPayment with amount and payment', async () => {
      const refundSpy = jest
        .spyOn(paymentService, 'refundPayment')
        .mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: {
          actions: [{ action: 'refundPayment', amount }],
        },
      });

      expect(refundSpy).toHaveBeenCalledWith({
        amount,
        payment: mockGetPaymentResult,
        transactionId: undefined,
      });
    });

    test('refundPayment with transactionId', async () => {
      const refundSpy = jest
        .spyOn(paymentService, 'refundPayment')
        .mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: {
          actions: [{ action: 'refundPayment', amount, transactionId: 'tx-123' }],
        },
      });

      expect(refundSpy).toHaveBeenCalledWith({
        amount,
        payment: mockGetPaymentResult,
        transactionId: 'tx-123',
      });
    });

    test('reversePayment action delegates to reversePayment with payment and returns its outcome', async () => {
      const reverseSpy = jest
        .spyOn(paymentService, 'reversePayment')
        .mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      const result = await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: {
          actions: [{ action: 'reversePayment' }],
        },
      });

      expect(reverseSpy).toHaveBeenCalledWith({
        payment: mockGetPaymentResult,
      });
      expect(result).toEqual({ outcome: 'approved' });
    });

    test('unknown action throws ErrorInvalidOperation', async () => {
      await expect(
        paymentService.modifyPayment({
          paymentId: mockGetPaymentResult.id,
          data: {
            actions: [{ action: 'unknownAction' } as any],
          },
        }),
      ).rejects.toThrow(ErrorInvalidOperation);

      await expect(
        paymentService.modifyPayment({
          paymentId: mockGetPaymentResult.id,
          data: {
            actions: [{ action: 'unknownAction' } as any],
          },
        }),
      ).rejects.toThrow('Operation not supported');
    });

    test('ctPaymentService.getPayment always called with correct id', async () => {
      const getPaymentSpy = jest
        .spyOn(paymentSDK.ctPaymentService, 'getPayment')
        .mockResolvedValue(mockGetPaymentResult as never);
      jest.spyOn(paymentService, 'settlement').mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      await paymentService.modifyPayment({
        paymentId: 'payment-456',
        data: {
          actions: [{ action: 'capturePayment', amount }],
        },
      });

      expect(getPaymentSpy).toHaveBeenCalledWith({ id: 'payment-456' });
      expect(getPaymentSpy).toHaveBeenCalledTimes(1);
    });

    test('settlement receives correct shape from settlement spy', async () => {
      const settlementSpy = jest
        .spyOn(paymentService, 'settlement')
        .mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      const testPayment = {
        ...mockGetPaymentResult,
        id: 'test-payment-123',
        version: 2,
      };

      jest.spyOn(paymentSDK.ctPaymentService, 'getPayment').mockResolvedValue(testPayment as never);

      await paymentService.modifyPayment({
        paymentId: 'test-payment-123',
        data: {
          actions: [{ action: 'capturePayment', amount }],
        },
      });

      expect(settlementSpy).toHaveBeenCalledWith({
        payment: testPayment,
        amount,
      });
    });

    test('void receives only payment, no amount', async () => {
      const voidSpy = jest
        .spyOn(paymentService, 'void')
        .mockResolvedValue({ outcome: PaymentModificationStatus.APPROVED });

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: {
          actions: [{ action: 'cancelPayment' }],
        },
      });

      // Verify void was called with only payment, not amount
      expect(voidSpy).toHaveBeenCalledWith({
        payment: mockGetPaymentResult,
      });
      expect(voidSpy.mock.calls[0][0]).not.toHaveProperty('amount');
    });
  });
});
