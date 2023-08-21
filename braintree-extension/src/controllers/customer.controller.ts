import { Customer, CustomerReference } from '@commercetools/platform-sdk';
import CustomError from '../errors/custom.error';
import { UpdateAction } from '@commercetools/sdk-client-v2';
import {
  handleCreateRequest,
  handleFindRequest,
  handleVaultRequest,
  handleUpdatePaymentRequest,
  handleDeletePaymentRequest,
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
    const {
      findRequest,
      createRequest,
      updatePaymentRequest,
      deletePaymentRequest,
    } = customer?.custom?.fields || {};
    updateActions = updateActions.concat(
      await handleUpdatePaymentRequest(updatePaymentRequest, customer),
      await handleDeletePaymentRequest(deletePaymentRequest, customer),
      await handleFindRequest(findRequest, customer),
      await handleCreateRequest(customer, createRequest),
      await handleVaultRequest(customer)
    );
    return { statusCode: 200, actions: updateActions };
  } catch (error) {
    if (error instanceof Error) {
      throw new CustomError(
        400,
        `Internal server error on CustomerController: ${error.stack}`
      );
    }
    throw new CustomError(400, JSON.stringify(error));
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
