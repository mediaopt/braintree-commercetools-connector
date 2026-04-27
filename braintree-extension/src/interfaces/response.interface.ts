import { UpdateActions } from 'common-connect/dist';

export interface ResponseInterfaceSuccess {
  actions: UpdateActions;
}

export interface ResponseInterfaceError {
  errors: Array<unknown>;
}
