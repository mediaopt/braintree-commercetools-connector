import { UpdateAction } from '@commercetools/sdk-client-v2';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { getClientToken } from '../service/braintree.service';
import { PaymentReference } from '@commercetools/platform-sdk';
import braintree, { ClientTokenRequest } from 'braintree';

const handleRequest = async (
  requestName: string,
  request: braintree.ClientTokenRequest
): Promise<UpdateAction[]> => {
  const updateActions: Array<UpdateAction> = [];
  let response;
  switch (requestName) {
    case 'getClientToken':
      response = await getClientToken(request);
      break;
    default:
      throw new CustomError(
        500,
        `Internal Server Error - Request not recognized. Allowed values are 'getClientToken'.`
      );
  }
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

/**
 * Handle the update action
 *
 * @param {PaymentReference} resource The resource from the request body
 * @returns {object}
 */
const update = async (resource: PaymentReference) => {
  try {
    let updateActions: Array<UpdateAction> = [];

    logger.info('Update payment called', resource);
    if (resource?.obj?.custom?.fields?.getClientTokenRequest) {
      const request: ClientTokenRequest = JSON.parse(
        resource.obj.custom.fields.getClientTokenRequest
      );
      updateActions = await handleRequest('getClientToken', request);
    }

    return { statusCode: 200, actions: updateActions };
  } catch (error) {
    // Retry or handle the error
    // Create an error object
    if (error instanceof Error) {
      throw new CustomError(
        400,
        `Internal server error on PaymentController: ${error.stack}`
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
export const paymentController = async (
  action: string,
  resource: PaymentReference
) => {
  switch (action) {
    case 'Create': {
      break;
    }
    case 'Update':
      return update(resource);
    default:
      throw new CustomError(
        500,
        `Internal Server Error - Resource not recognized. Allowed values are 'Create' or 'Update'.`
      );
  }
};
