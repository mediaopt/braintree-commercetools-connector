import { Customer, CustomerReference } from '@commercetools/platform-sdk';
import CustomError from '../errors/custom.error';
import { UpdateAction } from '@commercetools/sdk-client-v2';
import { handleCustomerResponse, handleError } from '../utils/response.utils';
import {
  createCustomer,
  findCustomer,
  updateCustomer,
} from '../service/braintree.service';
import { logger } from '../utils/logger.utils';
import { mapCommercetoolsCustomerToBraintreeCustomerCreateRequest } from '../utils/map.utils';
import {
  CustomerCreateRequest,
  CustomerUpdateRequest,
  Customer as BraintreeCustomer,
} from 'braintree';

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
    if (customer?.custom?.fields?.findRequest) {
      const request = JSON.parse(customer.custom.fields.findRequest);

      try {
        const customerId =
          request?.customerId ??
          customer?.custom.fields?.customerId ??
          customer.id;
        logger.info(`findCustomer request: ${customerId}`);
        const response = await findCustomer(customerId);
        updateActions = updateActions.concat(
          handleCustomerResponse('find', response, customer)
        );
      } catch (e) {
        logger.error('Call to find customer resulted in an error', e);
        updateActions = handleError('find', e);
      }
    }
    if (customer?.custom?.fields?.createRequest) {
      try {
        const request =
          mapCommercetoolsCustomerToBraintreeCustomerCreateRequest(
            customer,
            customer.custom.fields.createRequest
          );
        logger.info(`createCustomer request: ${JSON.stringify(request)}`);
        if (!request.id) {
          throw new CustomError(400, 'field customerId is missing');
        }
        const response = await createCustomer(request);
        updateActions = updateActions.concat(
          handleCustomerResponse('create', response, customer)
        );
      } catch (e) {
        logger.error('Call to create customer resulted in an error', e);
        updateActions = handleError('create', e);
      }
    }
    if (customer?.custom?.fields?.vaultRequest) {
      try {
        const request = {
          paymentMethodNonce: customer.custom.fields.vaultRequest,
        } as CustomerUpdateRequest;
        let response: BraintreeCustomer;
        if (!customer?.custom.fields?.customerId) {
          const createRequest: CustomerCreateRequest =
            mapCommercetoolsCustomerToBraintreeCustomerCreateRequest(
              customer,
              JSON.stringify(request)
            );
          logger.info(
            `createCustomer request: ${JSON.stringify(createRequest)}`
          );
          response = await createCustomer(createRequest);
        } else {
          logger.info(`updateCustomer request: ${JSON.stringify(request)}`);
          response = await updateCustomer(
            customer.custom.fields.customerId,
            request
          );
        }
        updateActions = updateActions.concat(
          handleCustomerResponse('vault', response, customer)
        );
      } catch (e) {
        logger.error('Call to create customer resulted in an error', e);
        updateActions = handleError('vault', e);
      }
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
