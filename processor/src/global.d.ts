import '@fastify/request-context';
import { ContextData, SessionContextData } from './libs/fastify/context/context';

declare module '@fastify/request-context' {
  interface RequestContextData {
    request: ContextData;
    session?: SessionContextData;
  }
}

// @types/braintree doesn't declare this field even though the Braintree Node SDK's runtime
// attribute whitelist accepts it (transaction_gateway.js's _createSignature() lists
// "usBankAccount[achMandateText]" / "usBankAccount[achMandateAcceptedAt]").
declare module 'braintree' {
  interface TransactionRequest {
    usBankAccount?: {
      achMandateText?: string;
      achMandateAcceptedAt?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vite: any;
  }

  export interface FastifyRequest {
    correlationId?: string;
  }
}
