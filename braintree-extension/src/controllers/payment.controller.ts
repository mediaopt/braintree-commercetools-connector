import CustomError from '../errors/custom.error';
import { Resource } from '../interfaces/resource.interface';

/**
 * Handle the update action
 *
 * @param {Resource} resource The resource from the request body
 * @returns {object}
 */
const update = async (resource: Resource) => {
    try {
        return { statusCode: 200, actions: [] };
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
