import { UpdateAction } from '@commercetools/sdk-client-v2';

export const handleResponse = (
  requestName: string,
  response
): UpdateAction[] => {
  const updateActions: Array<UpdateAction> = [];
  updateActions.push({
    action: 'setCustomField',
    name: requestName + 'Response',
    value: response,
  });
  updateActions.push({
    action: 'setCustomField',
    name: requestName + 'Request',
    value: null,
  });
  return updateActions;
};

export const handleError = (
  requestName: string,
  unsetResponse: boolean
): UpdateAction[] => {
  const updateActions: Array<UpdateAction> = [];
  if (unsetResponse) {
    updateActions.push({
      action: 'setCustomField',
      name: requestName + 'Response',
      value: null,
    });
  }
  updateActions.push({
    action: 'setCustomField',
    name: requestName + 'Request',
    value: null,
  });
  return updateActions;
};
