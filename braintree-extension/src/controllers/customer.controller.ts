import { Customer, CustomerReference } from '@commercetools/platform-sdk';
import CustomError from '../errors/custom.error';
import { UpdateAction } from '@commercetools/sdk-client-v2';
import {
  handleCreateRequest,
  handleFindRequest,
  handleVaultRequest,
} from '../service/customer.service';

/**
 * Handle the update action
 *
 * @param {CustomerReference} resource The resource from the request body
 * @returns {object}
 */
const update = async (resource: CustomerReference) => {
  try {
    let updateActions: Array<UpdateAction> = [];
    if (!resource?.obj) {
      throw new CustomError(400, 'customer obj is missing');
    }
    const customer: Customer = resource.obj;
    const { findRequest, createRequest, vaultRequest } =
      customer?.custom?.fields || {};
    if (findRequest) {
      updateActions = updateActions.concat(
        await handleFindRequest(findRequest, customer)
      );
    }
    if (createRequest) {
      updateActions = updateActions.concat(
        await handleCreateRequest(customer, createRequest)
      );
    }
    if (vaultRequest) {
      updateActions = updateActions.concat(await handleVaultRequest(customer));
    }
    return { statusCode: 200, actions: updateActions };
  } catch (error) {
    // Retry or handle the error
    // Create an error object
    if (error instanceof Error) {
      throw new CustomError(
        400,
        `Internal server error on CustomerController: ${error.stack}`
      );
    }
  }
};

/**
 * Handle the cart controller according to the action
 *
 * @param {string} action The action that comes with the request. Could be `Create` or `Update`
 * @param {Resource} resource The resource from the request body
 * @returns {Promise<object>} The data from the method that handles the action
 */
export const customerController = async (
  action: string,
  resource: CustomerReference
) => {
  switch (action) {
    case 'Create': {
      break;
    }
    case 'Update':
      return await update(resource);
    default:
      throw new CustomError(
        500,
        `Internal Server Error - Resource not recognized. Allowed values are 'Create' or 'Update'.`
      );
  }
};
