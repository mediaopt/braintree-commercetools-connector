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

const buildCustomFieldAction = (
  name: string,
  value: unknown,
  transactionId?: string
): UpdateActions[number] =>
  transactionId
    ? { action: 'setTransactionCustomField', transactionId, name, value }
    : { action: 'setCustomField', name, value };

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
  updateActions.push(
    buildCustomFieldAction(
      messageName + 'Response',
      stringifyData(message),
      transactionId
    ),
    buildCustomFieldAction(messageName + 'Request', null, transactionId)
  );
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
  return [
    buildCustomFieldAction(
      `${requestName}Response`,
      JSON.stringify({ success: false, message: errorMessage }),
      transactionId
    ),
    buildCustomFieldAction(`${requestName}Request`, null, transactionId),
  ];
};
