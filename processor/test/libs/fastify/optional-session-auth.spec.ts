import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  ErrorAuthErrorResponse,
  ErrorGeneral,
  SessionHeaderAuthenticationHook,
} from '@commercetools/connect-payments-sdk';
import { FastifyRequest } from 'fastify';
import { optionalSessionAuth } from '../../../src/libs/fastify/optional-session-auth';
import { log } from '../../../src/libs/logger';

const SESSION_ID = 'session-123';

// The SDK wraps every session failure in ErrorAuthErrorResponse('Session is not active'); only the cause differs
const sessionFailure = (cause: unknown) => new ErrorAuthErrorResponse('Session is not active', { cause });

describe('optionalSessionAuth', () => {
  let authenticate: jest.Mock<(request: FastifyRequest) => Promise<void>>;
  let hook: SessionHeaderAuthenticationHook;
  let logError: jest.SpiedFunction<typeof log.error>;
  let logInfo: jest.SpiedFunction<typeof log.info>;
  const request = (headers: Record<string, string> = { 'x-session-id': SESSION_ID }) =>
    ({ headers }) as unknown as FastifyRequest;

  beforeEach(() => {
    authenticate = jest.fn<(request: FastifyRequest) => Promise<void>>().mockResolvedValue(undefined);
    hook = { authenticate: () => authenticate } as unknown as SessionHeaderAuthenticationHook;
    logError = jest.spyOn(log, 'error').mockImplementation(() => log);
    logInfo = jest.spyOn(log, 'info').mockImplementation(() => log);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('makes no Session API call without a session header, logging it as info', async () => {
    await optionalSessionAuth(hook, request({}));

    expect(authenticate).not.toHaveBeenCalled();
    expect(logInfo.mock.calls).toEqual([['no session header, answering without a session']]);
    expect(logError).not.toHaveBeenCalled();
  });

  test('authenticates a request with a session header', async () => {
    const req = request();

    await optionalSessionAuth(hook, req);

    expect(authenticate).toHaveBeenCalledWith(req);
    expect(logError).not.toHaveBeenCalled();
  });

  // Every failure is an error, also the buyer's own bad session id (404 unknown, 400 malformed)
  test.each([
    [
      'an unknown session',
      new ErrorAuthErrorResponse('commercetools session not found', { privateFields: { status: 404 } }),
      'commercetools session not found (status 404)',
    ],
    [
      'a malformed session id',
      new ErrorGeneral('Could not get commercetools session', { privateFields: { status: 400 } }),
      'Could not get commercetools session (status 400)',
    ],
    [
      'a failing Session API',
      new ErrorGeneral('Could not get commercetools session', { privateFields: { status: 503 } }),
      'Could not get commercetools session (status 503)',
    ],
  ])('logs %s with its status, never the session id, and continues', async (_, cause, expected) => {
    authenticate.mockRejectedValue(sessionFailure(cause));

    await expect(optionalSessionAuth(hook, request())).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledTimes(1);
    const [message] = logError.mock.calls[0];
    expect(message).toContain(expected);
    expect(message).not.toContain(SESSION_ID);
  });

  test('logs an unreachable Session API without a status', async () => {
    authenticate.mockRejectedValue(sessionFailure(new Error('fetch failed')));

    await optionalSessionAuth(hook, request());

    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/answering without it — fetch failed$/));
  });
});
