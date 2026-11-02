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
  const request = (headers: Record<string, string> = { 'x-session-id': SESSION_ID }) =>
    ({ headers }) as unknown as FastifyRequest;

  beforeEach(() => {
    authenticate = jest.fn<(request: FastifyRequest) => Promise<void>>().mockResolvedValue(undefined);
    hook = { authenticate: () => authenticate } as unknown as SessionHeaderAuthenticationHook;
    logError = jest.spyOn(log, 'error').mockImplementation(() => log);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('makes no Session API call without a session header', async () => {
    await optionalSessionAuth(hook, request({}));

    expect(authenticate).not.toHaveBeenCalled();
  });

  test('authenticates a request with a session header', async () => {
    const req = request();

    await optionalSessionAuth(hook, req);

    expect(authenticate).toHaveBeenCalledWith(req);
    expect(logError).not.toHaveBeenCalled();
  });

  test('continues silently for a missing or inactive session', async () => {
    authenticate.mockRejectedValue(sessionFailure(new ErrorAuthErrorResponse('commercetools session not found')));

    await expect(optionalSessionAuth(hook, request())).resolves.toBeUndefined();

    expect(logError).not.toHaveBeenCalled();
  });

  test('logs a failing Session API with its status, never the session id', async () => {
    authenticate.mockRejectedValue(
      sessionFailure(new ErrorGeneral('Could not get commercetools session', { privateFields: { status: 503 } })),
    );

    await expect(optionalSessionAuth(hook, request())).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledTimes(1);
    const [message] = logError.mock.calls[0];
    expect(message).toContain('Could not get commercetools session (status 503)');
    expect(message).not.toContain(SESSION_ID);
  });

  test('logs an unreachable Session API without a status', async () => {
    authenticate.mockRejectedValue(sessionFailure(new Error('fetch failed')));

    await optionalSessionAuth(hook, request());

    expect(logError).toHaveBeenCalledWith(expect.stringMatching(/answering without it — fetch failed$/));
  });
});
