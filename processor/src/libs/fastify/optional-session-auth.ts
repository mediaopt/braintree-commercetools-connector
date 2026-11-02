import { SessionHeaderAuthenticationHook } from '@commercetools/connect-payments-sdk';
import { FastifyRequest } from 'fastify';
import { log } from '../logger';
import { errorMessage } from '../../utils/error.utils';
import { routeLabel } from './error-handler';

/**
 * Session auth for routes that also answer without a session (Express before a cart exists): fills the request
 * context when the session is readable, otherwise continues without a cart. No header → no Session API call.
 */
export const optionalSessionAuth = async (hook: SessionHeaderAuthenticationHook, request: FastifyRequest) => {
  const route = routeLabel(request);
  if (!request.headers['x-session-id']) {
    // Expected for Express before the merchant's session has a cart
    log.info(`${route}: no session header, answering without a session`);
    return;
  }
  try {
    await hook.authenticate()(request);
  } catch (err) {
    // Every failure is logged, also a missing, inactive or malformed session: the route in the text tells a one-off
    // (fails here only) from a broken session (the next required-auth call fails too, logged by the error handler)
    const cause = (err as { cause?: unknown }).cause;
    // Not the session id: it authenticates the buyer's calls. The Session API's HTTP status, when it answered
    const status = (cause as { privateFields?: { status?: unknown } } | undefined)?.privateFields?.status;
    log.error(
      `${route}: could not read the commercetools session, answering without it — ${errorMessage(cause ?? err)}${status ? ` (status ${status})` : ''}`,
    );
  }
};
