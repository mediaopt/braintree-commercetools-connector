import { createApplicationLogger, rewriteFieldsFormatter } from '@commercetools-backend/loggers';
import { getRequestContext } from '../fastify/context/context';
import { config } from '../../config/config';

type LogFormat = NonNullable<NonNullable<Parameters<typeof createApplicationLogger>[0]>['formatters']>[number];

/**
 * Every line logged during a request starts with its route, e.g. `GET /operations/config: …`, so the same failure in
 * different calls reads differently. The template, never the actual URL — a path param can be a payment method token
 * (`DELETE /stored-payment-methods/:id`), and a query string is whatever the caller sent. Lines logged outside a
 * request (startup, …) have no context and stay as they are.
 */
export const routePrefix: LogFormat = {
  transform: (info) => {
    const { method, pathTemplate } = getRequestContext();
    if (method) info.message = `${method} ${pathTemplate ?? 'unmatched route'}: ${info.message}`;
    return info;
  },
};

/**
 * Custom fields formatter to replace the removed defaultFieldsFormatter from the SDK
 * Uses rewriteFieldsFormatter to add standard fields to all log messages
 */
export const log = createApplicationLogger({
  formatters: [
    rewriteFieldsFormatter({
      fields: [
        {
          from: 'projectKey',
          to: 'projectKey',
          replaceValue: () => config.projectKey,
        },
        {
          from: 'version',
          to: 'version',
          replaceValue: () => process.env.npm_package_version || 'unknown',
        },
        {
          from: 'name',
          to: 'name',
          replaceValue: () => process.env.npm_package_name || 'unknown',
        },
        {
          from: 'correlationId',
          to: 'correlationId',
          replaceValue: () => getRequestContext().correlationId,
        },
        {
          from: 'pathTemplate',
          to: 'pathTemplate',
          replaceValue: () => getRequestContext().pathTemplate,
        },
        {
          from: 'path',
          to: 'path',
          replaceValue: () => getRequestContext().path,
        },
      ],
    }),
    routePrefix,
  ],
});
