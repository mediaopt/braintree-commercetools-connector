import { logger } from 'common-connect/src/utils/logger.utils';
import { UpdateActions, CustomerResponse } from '../types/index.types';
import { Customer } from '@commercetools/platform-sdk';
import {
  handleInterfaceInteraction,
  stringifyData,
} from 'common-connect/src/utils/customEntitites.utils';
import { MessageFieldData } from 'common-connect/src/types/index.types';

const logCleanMessage = ({
  messageName,
  message,
  messageType,
}: MessageFieldData): UpdateActions => {
  if (typeof message === 'object') {
    removeEmptyProperties(message);
  }
  logger.info(`${messageName} ${messageType}: ${JSON.stringify(message)}`);
  return [
    {
      action: 'addInterfaceInteraction',
      ...handleInterfaceInteraction({
        messageName,
        message,
        messageType,
      }),
    },
  ];
};

export const handleRequest = (
  messageName: string,
  message: string | object
): UpdateActions => {
  logCleanMessage({
    messageName,
    message,
    messageType: 'Request',
  });
  return logCleanMessage({
    messageName,
    message,
    messageType: 'Request',
  });
};

export const handlePaymentResponse = (
  messageName: string,
  message: string | object,
  transactionId?: string
): UpdateActions => {
  const updateActions = logCleanMessage({
    messageName,
    message,
    messageType: 'Response',
  });
  updateActions.push({
    action: transactionId ? 'setTransactionCustomField' : 'setCustomField',
    transactionId: transactionId,
    name: messageName + 'Response',
    value: stringifyData(message),
  });
  updateActions.push({
    action: transactionId ? 'setTransactionCustomField' : 'setCustomField',
    transactionId: transactionId,
    name: messageName + 'Request',
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
