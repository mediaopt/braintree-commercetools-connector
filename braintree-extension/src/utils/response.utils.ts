import { UpdateAction } from '@commercetools/sdk-client-v2';
import { BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY } from '../connector/actions';
import { getCurrentTimestamp } from './data.utils';

export const handleRequest = (
  requestName: string,
  request: string | object
): UpdateAction[] => {
  const updateActions: Array<UpdateAction> = [];
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
  return updateActions;
};

function stringifyData(data: string | object) {
  return typeof data === 'string' ? data : JSON.stringify(data);
}

export const handleResponse = (
  requestName: string,
  response: string | object
): UpdateAction[] => {
  const updateActions: Array<UpdateAction> = [];
  if (typeof response === 'object') {
    removeEmptyProperties(response);
  }
  updateActions.push({
    action: 'setCustomField',
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
    action: 'setCustomField',
    name: requestName + 'Request',
    value: null,
  });
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
  error: unknown
): UpdateAction[] => {
  const errorMessage =
    error instanceof Error && 'message' in error
      ? error.message
      : 'Unknown error';
  const updateActions: Array<UpdateAction> = [];
  updateActions.push({
    action: 'setCustomField',
    name: requestName + 'Response',
    value: JSON.stringify({ success: false, message: errorMessage }),
  });
  updateActions.push({
    action: 'setCustomField',
    name: requestName + 'Request',
    value: null,
  });
  return updateActions;
};
