import { UpdateActions } from 'common-connect/dist';

export type ControllerActionsResponse =
  | {
      statusCode: number;
      actions: UpdateActions;
    }
  | undefined;

export function findSetCustomFieldAction(
  actions: UpdateActions,
  name: string
) {
  return actions.find(
    (action) =>
      (action.action === 'setCustomField' ||
        action.action === 'setTransactionCustomField') &&
      'name' in action &&
      action.name === name
  ) as { action: string; name: string; value: string } | undefined;
}
