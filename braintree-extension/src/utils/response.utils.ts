import { BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY } from '../connector/actions';
import { getCurrentTimestamp } from './data.utils';
import { logger } from './logger.utils';
import { UpdateActions, CustomerResponse } from '../types/index.types';
import { Customer } from '@commercetools/platform-sdk';

export const handleRequest = (
  requestName: string,
  request: string | object
): UpdateActions => {
  const updateActions: UpdateActions = [];
  if (typeof request === 'object') {
    removeEmptyProperties(request);
  }
  updateActions.push({
    action: 'addInterfaceInteraction',
    type: {
      typeId: 'type',
      key: BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
    },
    fields: {
      type: requestName + 'Request',
      data: stringifyData(request),
      timestamp: getCurrentTimestamp(),
    },
  });
  logger.info(`${requestName} request: ${JSON.stringify(request)}`);
  return updateActions;
};

function stringifyData(data: string | object) {
  return typeof data === 'string' ? data : JSON.stringify(data);
}

export const handlePaymentResponse = (
  requestName: string,
  response: string | object,
  transactionId?: string
): UpdateActions => {
  const updateActions: UpdateActions = [];
  if (typeof response === 'object') {
    removeEmptyProperties(response);
  }
  updateActions.push({
    action: transactionId ? 'setTransactionCustomField' : 'setCustomField',
    transactionId: transactionId,
    name: requestName + 'Response',
    value: stringifyData(response),
  });
  updateActions.push({
    action: 'addInterfaceInteraction',
    type: {
      typeId: 'type',
      key: BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
    },
    fields: {
      type: requestName + 'Response',
      data: stringifyData(response),
      timestamp: getCurrentTimestamp(),
    },
  });
  updateActions.push({
    action: transactionId ? 'setTransactionCustomField' : 'setCustomField',
    transactionId: transactionId,
    name: requestName + 'Request',
    value: null,
  });
  return updateActions;
};

export const handleCustomerResponse = (
  requestName: string,
  response: CustomerResponse | string,
  customer: Customer
): UpdateActions => {
  const updateActions: UpdateActions = [];
  if (typeof response === 'object') {
    removeEmptyProperties(response);
  }
  updateActions.push({
    action: 'setCustomField',
    name: `${requestName}Response`,
    value: stringifyData(response),
  });
  updateActions.push({
    action: 'setCustomField',
    name: `${requestName}Request`,
    value: null,
  });
  if (
    !customer?.custom?.fields?.braintreeCustomerId &&
    typeof response === 'object' &&
    'id' in response &&
    response.id
  ) {
    updateActions.push({
      action: 'setCustomField',
      name: 'braintreeCustomerId',
      value: response.id,
    });
  }
  return updateActions;
};

export const removeEmptyProperties = (response: any) => {
  for (const prop in response) {
    if (response[prop] === null) {
      delete response[prop];
    }
    if (typeof response[prop] === 'object') {
      removeEmptyProperties(response[prop]);
      if (Object.keys(response[prop]).length === 0) {
        delete response[prop];
      }
    }
  }
};

export const handleError = (
  requestName: string,
  error: unknown,
  transactionId?: string
): UpdateActions => {
  const errorMessage =
    error instanceof Error && 'message' in error
      ? error.message
      : 'Unknown error';
  const updateActions: UpdateActions = [];
  updateActions.push({
    action: transactionId ? 'setTransactionCustomField' : 'setCustomField',
    transactionId: transactionId,
    name: `${requestName}Response`,
    value: JSON.stringify({ success: false, message: errorMessage }),
  });
  updateActions.push({
    action: transactionId ? 'setTransactionCustomField' : 'setCustomField',
    transactionId: transactionId,
    name: `${requestName}Request`,
    value: null,
  });
  return updateActions;
};
