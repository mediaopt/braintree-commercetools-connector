import { UpdateActions } from '../types/index.types';

export interface ResponseInterfaceSuccess {
  actions: UpdateActions;
}

export interface ResponseInterfaceError {
  errors: Array<unknown>;
}
