import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  braintreeErrorRef,
  errorMessage,
  warnOnFieldMismatch,
  formatBraintreeSyncContext,
  getCtErrorKind,
  retryCTSync,
} from '../../src/utils/error.utils';
import { CustomError, logger, withBraintreeResponse } from 'common-connect/dist';

describe('error.utils', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    { description: 'uses the message of an Error', err: new Error('test error'), expected: 'test error' },
    { description: 'keeps the code of a non-Error object', err: { code: 'ENOTFOUND' }, expected: 'ENOTFOUND' },
    {
      description: 'keeps code, status and message of a non-Error object but never its body',
      err: { statusCode: 409, message: 'Conflict', body: { actions: [{ address: '1 Private Street' }] } },
      expected: '409 Conflict',
    },
    { description: 'falls back for null', err: null, expected: 'unknown error' },
    { description: 'falls back for undefined', err: undefined, expected: 'unknown error' },
  ])('errorMessage $description', ({ err, expected }) => {
    expect(errorMessage(err)).toBe(expected);
  });

  test('warnOnFieldMismatch logs only fields present on both sides with different values', () => {
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    warnOnFieldMismatch('payment-123', [
      { fieldName: 'matching', enablerValue: 'val1', braintreeValue: 'val1' },
      { fieldName: 'different', enablerValue: 'val2', braintreeValue: 'val3' },
      { fieldName: 'enablerMissing', enablerValue: undefined, braintreeValue: 'val4' },
      { fieldName: 'braintreeMissing', enablerValue: 'val5', braintreeValue: undefined },
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('different mismatch for payment payment-123');
  });

  test.each([
    {
      description: 'status and amount',
      response: { status: 'authorized', orderId: undefined, amount: '100.00' },
      extra: undefined,
      expected: 'authorized, amount: 100.00',
    },
    {
      description: 'orderId when present',
      response: { status: 'submitted_for_settlement', orderId: 'order-123', amount: '200.00' },
      extra: undefined,
      expected: 'submitted_for_settlement, orderId: order-123, amount: 200.00',
    },
    {
      description: 'extras without false and undefined',
      response: { status: 'authorized', orderId: undefined, amount: '100.00' },
      extra: ['extra-data', false, undefined, 'another-extra'],
      expected: 'authorized, extra-data, another-extra, amount: 100.00',
    },
  ] as const)('formatBraintreeSyncContext includes $description', ({ response, extra, expected }) => {
    expect(formatBraintreeSyncContext(response as never, extra as never)).toBe(expected);
  });

  test.each([
    { err: { httpErrorStatus: 401 }, expected: 'auth' },
    { err: { httpErrorStatus: 403 }, expected: 'auth' },
    { err: { httpErrorStatus: 404 }, expected: 'not-found' },
    { err: { httpErrorStatus: 500 }, expected: 'other' },
    // raw CT API client errors carry statusCode instead of httpErrorStatus
    { err: { statusCode: 401 }, expected: 'auth' },
    { err: { statusCode: 404 }, expected: 'not-found' },
    { err: { httpErrorStatus: 401, statusCode: 404 }, expected: 'auth' },
    { err: {}, expected: 'other' },
    { err: new Error('test'), expected: 'other' },
  ])('getCtErrorKind($err) is $expected', ({ err, expected }) => {
    expect(getCtErrorKind(err)).toBe(expected);
  });

  // logs say which Braintree failure it was, never its message (which can echo personal data)
  describe('braintreeErrorRef', () => {
    const failed = (message: string, response: object) =>
      withBraintreeResponse(new CustomError(500, message), { success: false, message, ...response });

    test.each([
      {
        description: 'validation error codes',
        err: failed('Street address is too long: 1 Private Street', {
          errors: { deepErrors: () => [{ code: '81812' }, { code: '91803' }] },
        }),
        expected: 'Braintree error codes: 81812, 91803',
      },
      {
        description: 'a declined transaction',
        err: failed('Do Not Honor', {
          errors: { deepErrors: () => [] },
          transaction: { id: 'tx-1', processorResponseCode: '2000', processorResponseType: 'soft_declined' },
        }),
        expected: 'processor response code: 2000, processor response type: soft_declined, transaction: tx-1',
      },
      {
        description: 'a response without codes',
        err: failed('Something about Jane Doe', {}),
        expected: 'Braintree error without code',
      },
      {
        description: 'an SDK error without a Braintree response: its name',
        err: Object.assign(new Error('not found: jane@example.com'), { name: 'notFoundError' }),
        expected: 'Braintree error: notFoundError',
      },
      { description: 'a non-Error', err: 'boom', expected: 'Braintree error: unknown' },
    ])('$description', ({ err, expected }) => {
      expect(braintreeErrorRef(err)).toBe(expected);
    });
  });

  describe('retryCTSync', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(logger, 'info').mockImplementation(() => logger);
      jest.spyOn(logger, 'warn').mockImplementation(() => logger);
      jest.spyOn(logger, 'error').mockImplementation(() => logger);
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    test('succeeds on first attempt', async () => {
      const fn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      await retryCTSync(fn, 'testMethod', 'payment-123', 'status: authorized', 3);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(logger.info).not.toHaveBeenCalled();
    });

    test('retries and succeeds on second attempt', async () => {
      const fn = jest
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('first fail'))
        .mockResolvedValueOnce(undefined);
      const promise = retryCTSync(fn, 'testMethod', 'payment-123', 'status: authorized', 3);
      await jest.advanceTimersByTimeAsync(500);
      await promise;
      expect(fn).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith('testMethod: CT sync succeeded on retry 2, paymentId: payment-123');
    });

    test('exhausts retry attempts', async () => {
      const fn = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('always fails'));
      const promise = retryCTSync(fn, 'testMethod', 'payment-123', 'status: authorized', 3);
      // Advance timer past all retries
      await jest.advanceTimersByTimeAsync(500 * 2 + 500 * 4 + 1000);
      await promise;
      expect(fn).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        'testMethod: CT sync exhausted all 3 attempts, paymentId: payment-123 [Braintree: status: authorized]',
      );
    });

    test('stops immediately on auth error (401)', async () => {
      const fn = jest.fn<() => Promise<void>>().mockRejectedValueOnce({ httpErrorStatus: 401 });
      await retryCTSync(fn, 'testMethod', 'payment-123', 'status: authorized', 3);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'testMethod: CT sync skipping retry (auth error), paymentId: payment-123 [Braintree: status: authorized]',
      );
    });

    test('stops immediately on 404', async () => {
      const fn = jest.fn<() => Promise<void>>().mockRejectedValueOnce({ httpErrorStatus: 404 });
      await retryCTSync(fn, 'testMethod', 'payment-123', 'status: authorized', 3);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'testMethod: CT payment not found after Braintree operation completed (404), paymentId: payment-123 — CT state is permanently inconsistent [Braintree: status: authorized]',
      );
    });

    test('omits the Braintree suffix without logOnError', async () => {
      const fn = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('always fails'));
      const promise = retryCTSync(fn, 'testMethod', 'payment-123', '', 2);
      // With maxAttempts=2, backoff is 500ms once, then final error
      await jest.advanceTimersByTimeAsync(500 + 1000);
      await promise;
      expect(fn).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith('testMethod: CT sync exhausted all 2 attempts, paymentId: payment-123');
    });
  });
});
