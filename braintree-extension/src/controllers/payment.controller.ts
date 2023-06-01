import { UpdateAction } from '@commercetools/sdk-client-v2';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { getClientToken, transactionSale } from '../service/braintree.service';
import { PaymentReference } from '@commercetools/platform-sdk';
import { ClientTokenRequest, TransactionRequest } from 'braintree';
import {
  handleRequest,
  handleResponse,
  handleError,
} from '../utils/response.utils';

function parseTransactionSaleRequest(
  resource: PaymentReference
): TransactionRequest {
  if (!resource?.obj?.custom?.fields.transactionSaleRequest) {
    throw new CustomError(500, 'transactionSaleRequest is missing');
  }
  if (!resource.obj.amountPlanned) {
    throw new CustomError(500, 'amountPlanned is missing');
  }
  let request: TransactionRequest;
  try {
    request = JSON.parse(
      resource.obj.custom.fields.transactionSaleRequest
    ) as TransactionRequest;

    return request;
  } catch (e) {
    request = {
      paymentMethodNonce: resource.obj.custom.fields.transactionSaleRequest,
    } as TransactionRequest;
  }
  request.amount = String(
    resource.obj.amountPlanned.centAmount *
      Math.pow(10, -resource.obj.amountPlanned.fractionDigits || 0)
  );
  request.options = {
    submitForSettlement: process.env.BRAINTREE_AUTOCAPTURE === 'true',
  };
  return request;
}

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
      updateActions = handleRequest('getClientToken', request);
      try {
        const response = await getClientToken(request);
        updateActions = updateActions.concat(
          handleResponse('getClientToken', response)
        );
      } catch (e) {
        logger.error('Call to getClientToken resulted in an error', e);
        updateActions = handleError('getClientToken', e);
      }
    }
    if (resource?.obj?.custom?.fields?.transactionSaleRequest) {
      try {
        const request = parseTransactionSaleRequest(resource);
        updateActions = handleRequest('transactionSale', request);
        logger.info('Transaction Sale request', request);
        const response = await transactionSale(request);
        updateActions = updateActions.concat(
          handleResponse('transactionSale', response)
        );
        updateActions.push({
          action: 'addTransaction',
          transaction: {
            type: response.status === 'authorized' ? 'Authorization' : 'Charge',
            amount: {
              centAmount: resource.obj?.amountPlanned.centAmount,
              currencyCode: resource.obj?.amountPlanned.currencyCode,
            },
            interactionId: response.id,
            timestamp: response.createdAt,
            state: 'Success',
          },
        });
        if (!resource?.obj?.interfaceId) {
          updateActions.push({
            action: 'setInterfaceId',
            interfaceId: response.id,
          });
        }
        updateActions.push({
          action: 'setStatusInterfaceCode',
          interfaceCode: response.status,
        });
        updateActions.push({
          action: 'setStatusInterfaceText',
          interfaceText: response.status,
        });
        updateActions.push({
          action: 'setMethodInfoMethod',
          method: response.paymentInstrumentType,
        });
      } catch (e) {
        updateActions = handleError('transactionSale', e);
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
