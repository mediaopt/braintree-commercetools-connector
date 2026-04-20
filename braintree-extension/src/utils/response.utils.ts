import {
  logger,
  handleInterfaceInteraction,
  stringifyData,
  removeEmptyProperties,
  MessageFieldData,
  UpdateActions,
} from 'common-connect/dist';

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
): UpdateActions =>
  logCleanMessage({
    messageName,
    message,
    messageType: 'Request',
  });

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
