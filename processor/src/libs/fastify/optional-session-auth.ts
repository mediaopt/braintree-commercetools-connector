import { ErrorAuthErrorResponse, SessionHeaderAuthenticationHook } from '@commercetools/connect-payments-sdk';
import { FastifyRequest } from 'fastify';
import { log } from '../logger';
import { errorMessage } from '../../utils/error.utils';

/**
 * Session auth for routes that also answer without a session (Express before a cart exists): fills the request
 * context when the session is readable, otherwise continues without a cart. No header → no Session API call.
 */
export const optionalSessionAuth = async (hook: SessionHeaderAuthenticationHook, request: FastifyRequest) => {
  if (!request.headers['x-session-id']) return;
  try {
    await hook.authenticate()(request);
  } catch (err) {
    // A missing or inactive session is expected here; anything else (Session API unreachable or failing) is not,
    // and silently drops the session's cart and customer from this answer
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof ErrorAuthErrorResponse) return;
    // Not the session id: it authenticates the buyer's calls. The Session API's HTTP status, when it answered
    const status = (cause as { privateFields?: { status?: unknown } } | undefined)?.privateFields?.status;
    log.error(
      `could not read the commercetools session, answering without it — ${errorMessage(cause ?? err)}${status ? ` (status ${status})` : ''}`,
    );
  }
};
