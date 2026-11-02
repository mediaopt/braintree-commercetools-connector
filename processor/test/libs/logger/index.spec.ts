import { afterEach, describe, expect, jest, test } from '@jest/globals';
import * as context from '../../../src/libs/fastify/context/context';
import { log, routePrefix } from '../../../src/libs/logger';

const prefixed = (message: string) =>
  (routePrefix.transform({ level: 'error', message }) as { message: string }).message;

describe('log route prefix', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('prefixes a line logged during a request with its method and route template, never the actual URL', () => {
    jest.spyOn(context, 'getRequestContext').mockReturnValue({
      method: 'DELETE',
      pathTemplate: '/stored-payment-methods/:id',
      path: '/stored-payment-methods/token-123',
    });

    expect(prefixed('failed')).toBe('DELETE /stored-payment-methods/:id: failed');
  });

  test('names a request that matched no route', () => {
    jest.spyOn(context, 'getRequestContext').mockReturnValue({ method: 'GET' });

    expect(prefixed('failed')).toBe('GET unmatched route: failed');
  });

  test('leaves a line logged outside a request unchanged', () => {
    expect(prefixed('started')).toBe('started');
  });

  test('is part of the logger', () => {
    jest.spyOn(context, 'getRequestContext').mockReturnValue({ method: 'GET', pathTemplate: '/operations/config' });

    // winston sets the level symbol its cli format reads
    const info = log.format.transform({ level: 'error', [Symbol.for('level')]: 'error', message: 'failed' });

    expect((info as { message: string }).message).toContain('GET /operations/config: failed');
  });
});
