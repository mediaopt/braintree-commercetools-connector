import { UpdateAction } from '@commercetools/sdk-client-v2';

import CustomError from '../errors/custom.error';
import { Resource } from '../interfaces/resource.interface';
import { logger } from '../utils/logger.utils';

/**
 * Handle the update action
 *
 * @param {Resource} resource The resource from the request body
 * @returns {object}
 */
const update = async (resource: Resource) => {
    try {
        const updateActions: Array<UpdateAction> = [];

        // Deserialize the resource to a PaymentDraft
        const paymentDraft = JSON.parse(JSON.stringify(resource));
        logger.info('Update payment called', paymentDraft);

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
export const paymentController = async (action: string, resource: Resource) => {
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
