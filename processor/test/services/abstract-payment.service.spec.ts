import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BraintreePaymentService } from '../../src/services/braintree-payment.service';
import { paymentSDK } from '../../src/payment-sdk';
import { ErrorInvalidOperation } from '@commercetools/connect-payments-sdk';
import { mockGetPaymentResult } from '../utils/mock-payment-results';
import { CentPrecisionMoney } from '@commercetools/platform-sdk';

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
      const settlementSpy = jest.spyOn(paymentService, 'settlement').mockResolvedValue({ success: true } as never);

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

    test('cancelPayment action calls void with payment', async () => {
      const voidSpy = jest.spyOn(paymentService, 'void').mockResolvedValue({ success: true } as never);

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

    test('refundPayment action calls refundPayment with amount and payment', async () => {
      const refundSpy = jest.spyOn(paymentService, 'refundPayment').mockResolvedValue({ success: true } as never);

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
      const refundSpy = jest.spyOn(paymentService, 'refundPayment').mockResolvedValue({ success: true } as never);

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

    test('reversePayment action calls void with payment', async () => {
      const voidSpy = jest.spyOn(paymentService, 'void').mockResolvedValue({ success: true } as never);

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: {
          actions: [{ action: 'reversePayment' }],
        },
      });

      expect(voidSpy).toHaveBeenCalledWith({
        payment: mockGetPaymentResult,
      });
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
      jest.spyOn(paymentService, 'settlement').mockResolvedValue({ success: true } as never);

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
      const settlementSpy = jest.spyOn(paymentService, 'settlement').mockResolvedValue({ success: true } as never);

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
      const voidSpy = jest.spyOn(paymentService, 'void').mockResolvedValue({ success: true } as never);

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

    test('reverse maps to void not refund', async () => {
      const voidSpy = jest.spyOn(paymentService, 'void').mockResolvedValue({ success: true } as never);
      const refundSpy = jest.spyOn(paymentService, 'refundPayment').mockResolvedValue({ success: true } as never);

      await paymentService.modifyPayment({
        paymentId: mockGetPaymentResult.id,
        data: {
          actions: [{ action: 'reversePayment' }],
        },
      });

      expect(voidSpy).toHaveBeenCalled();
      expect(refundSpy).not.toHaveBeenCalled();
    });
  });
});
