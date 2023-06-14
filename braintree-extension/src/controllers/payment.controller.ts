import { UpdateAction } from '@commercetools/sdk-client-v2';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import {
  getClientToken,
  refund as braintreeRefund,
  transactionSale,
} from '../service/braintree.service';
import {
  PaymentReference,
  Transaction as CommercetoolsTransaction,
  TransactionType,
} from '@commercetools/platform-sdk';
import { ClientTokenRequest, Transaction, TransactionRequest } from 'braintree';
import {
  handleError,
  handleRequest,
  handleResponse,
} from '../utils/response.utils';
import {
  mapBraintreeStatusToCommercetoolsTransactionState,
  mapBraintreeStatusToCommercetoolsTransactionType,
  mapBraintreeMoneyToCommercetoolsMoney,
} from '../utils/map.utils';

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

function parseRefundRequest(
  resource: PaymentReference,
  transaction?: CommercetoolsTransaction
) {
  const refundRequest =
    resource?.obj?.custom?.fields?.refundRequest ??
    transaction?.custom?.fields?.refundRequest;
  if (!refundRequest) {
    throw new CustomError(500, 'refundRequest is missing');
  }
  let request;
  try {
    request = JSON.parse(refundRequest);
  } catch (e) {
    request = {
      transactionId: refundRequest,
    };
  }
  request.transactionId =
    request.transactionId ??
    findSuitableTransactionId(resource, 'Charge', transaction);
  return request;
}

function findSuitableTransactionId(
  resource: PaymentReference,
  type: TransactionType,
  transaction?: CommercetoolsTransaction
) {
  if (transaction) {
    return transaction.interactionId;
  }
  const transactions = resource?.obj?.transactions.filter(
    (transaction: CommercetoolsTransaction): boolean =>
      transaction.type === type
  );
  if (!transactions || transactions.length === 0) {
    throw new CustomError(500, 'The payment has no suitable transaction');
  }
  return transactions[transactions.length - 1].interactionId;
}

function getPaymentMethodHint(response: Transaction): string {
  switch (response.paymentInstrumentType) {
    case 'credit_card':
      return `${response?.creditCard?.cardType} ${response?.creditCard?.maskedNumber}`;
    case 'paypal_account':
      return response?.paypalAccount?.payerEmail ?? '';
    case 'venmo_account':
      return response?.venmoAccount?.username ?? '';
    case 'android_pay_card':
      return response?.androidPayCard?.sourceDescription ?? '';
    default:
      return '';
  }
}

async function refund(
  resource: PaymentReference,
  transaction?: CommercetoolsTransaction
) {
  try {
    let updateActions: Array<UpdateAction>;
    const request = parseRefundRequest(resource, transaction);
    updateActions = handleRequest('refund', request);
    logger.info('Refund request', request);
    const response = await braintreeRefund(
      request.transactionId,
      request?.amount
    );
    updateActions = updateActions.concat(
      handleResponse('refund', response, transaction?.id)
    );
    updateActions.push({
      action: 'addTransaction',
      transaction: {
        type: 'Refund',
        amount: {
          centAmount: mapBraintreeMoneyToCommercetoolsMoney(
            response.amount,
            resource.obj?.amountPlanned.fractionDigits
          ),
          currencyCode: resource.obj?.amountPlanned.currencyCode,
        },
        interactionId: response.id,
        timestamp: response.updatedAt,
        state: mapBraintreeStatusToCommercetoolsTransactionState(
          response.status
        ),
      },
    });
    updateActions.push({
      action: 'setStatusInterfaceCode',
      interfaceCode: response.status,
    });
    updateActions.push({
      action: 'setStatusInterfaceText',
      interfaceText: response.status,
    });
    const paymentMethodHint = getPaymentMethodHint(response);
    updateActions.push({
      action: 'setMethodInfoMethod',
      method:
        response.paymentInstrumentType +
        (paymentMethodHint ? ` (${paymentMethodHint})` : ''),
    });
    return updateActions;
  } catch (e) {
    return handleError('refund', e, transaction?.id);
  }
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
            type: mapBraintreeStatusToCommercetoolsTransactionType(
              response.status
            ),
            amount: {
              centAmount: mapBraintreeMoneyToCommercetoolsMoney(
                response.amount,
                resource.obj?.amountPlanned.fractionDigits
              ),
              currencyCode: resource.obj?.amountPlanned.currencyCode,
            },
            interactionId: response.id,
            timestamp: response.updatedAt,
            state: mapBraintreeStatusToCommercetoolsTransactionState(
              response.status
            ),
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
        const paymentMethodHint = getPaymentMethodHint(response);
        updateActions.push({
          action: 'setMethodInfoMethod',
          method:
            response.paymentInstrumentType +
            (paymentMethodHint ? ` (${paymentMethodHint})` : ''),
        });
      } catch (e) {
        updateActions = handleError('transactionSale', e);
      }
    }
    if (resource?.obj?.custom?.fields?.refundRequest) {
      updateActions = updateActions.concat(await refund(resource));
    }
    if (resource?.obj?.transactions) {
      const promises = resource.obj.transactions.map(
        async (
          transaction: CommercetoolsTransaction
        ): Promise<UpdateAction[]> => {
          if (transaction?.custom?.fields?.refundRequest) {
            return await refund(resource, transaction);
          }
          return [];
        }
      );
      updateActions = updateActions.concat(...(await Promise.all(promises)));
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
