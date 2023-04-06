import { UpdateAction } from '@commercetools/sdk-client-v2';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { getClientToken } from '../service/braintree.service';
import { PaymentReference } from '@commercetools/platform-sdk';
import { ClientTokenRequest } from 'braintree';
import { handleResponse, handleError } from '../utils/response.utils';

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
      try {
        const response = await getClientToken(request);
        updateActions = handleResponse('getClientToken', response);
      } catch (e) {
        logger.error('Call to getClientToken resulted in an error', e);
        updateActions = handleError(
          'getClientToken',
          !!resource.obj.custom.fields.getClientTokenResponse
        );
      }
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
      return await update(resource);
    default:
      throw new CustomError(
        500,
        `Internal Server Error - Resource not recognized. Allowed values are 'Create' or 'Update'.`
      );
  }
};
