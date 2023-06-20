import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import {
  getClientToken,
  refund as braintreeRefund,
  transactionSale,
  submitForSettlement as braintreeSubmitForSettlement,
  voidTransaction as braintreeVoidTransaction,
} from '../service/braintree.service';
import {
  Payment,
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
import {
  PaymentWithOptionalTransaction,
  UpdateActions,
} from '../types/index.types';

function parseTransactionSaleRequest(payment: Payment): TransactionRequest {
  const transactionSaleRequest = payment?.custom?.fields.transactionSaleRequest;
  if (!transactionSaleRequest) {
    throw new CustomError(500, 'transactionSaleRequest is missing');
  }
  const amountPlanned = payment?.amountPlanned;
  if (!amountPlanned) {
    throw new CustomError(500, 'amountPlanned is missing');
  }
  let request: TransactionRequest;
  try {
    request = JSON.parse(transactionSaleRequest) as TransactionRequest;

    return request;
  } catch (e) {
    request = {
      paymentMethodNonce: transactionSaleRequest,
    } as TransactionRequest;
  }
  request.amount = String(
    amountPlanned.centAmount * Math.pow(10, -amountPlanned.fractionDigits || 0)
  );
  request.options = {
    submitForSettlement: process.env.BRAINTREE_AUTOCAPTURE === 'true',
  };
  return request;
}

function parseRequest(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction,
  requestField: string,
  transactionType: TransactionType
) {
  const requestJSON =
    paymentWithOptionalTransaction.payment?.custom?.fields[requestField] ??
    paymentWithOptionalTransaction?.transaction?.custom?.fields[requestField] ??
    null;
  if (!requestJSON) {
    throw new CustomError(500, `${requestField} is missing`);
  }
  let request;
  try {
    request = JSON.parse(requestJSON);
  } catch (e) {
    request = {
      transactionId: requestJSON,
    };
  }
  request.transactionId =
    request.transactionId ??
    findSuitableTransactionId(paymentWithOptionalTransaction, transactionType);
  return request;
}

function findSuitableTransactionId(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction,
  type: TransactionType
) {
  if (paymentWithOptionalTransaction?.transaction) {
    return paymentWithOptionalTransaction?.transaction.interactionId;
  }
  const transactions =
    paymentWithOptionalTransaction?.payment?.transactions.filter(
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
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction
) {
  try {
    let updateActions: UpdateActions;
    const request = parseRequest(
      paymentWithOptionalTransaction,
      'refundRequest',
      'Charge'
    );
    updateActions = handleRequest('refund', request);
    const response = await braintreeRefund(
      request.transactionId,
      request?.amount
    );
    updateActions = updateActions.concat(
      handleResponse(
        'refund',
        response,
        paymentWithOptionalTransaction?.transaction?.id
      )
    );
    const amountPlanned = paymentWithOptionalTransaction.payment?.amountPlanned;
    updateActions.push({
      action: 'addTransaction',
      transaction: {
        type: 'Refund',
        amount: {
          centAmount: mapBraintreeMoneyToCommercetoolsMoney(
            response.amount,
            amountPlanned?.fractionDigits
          ),
          currencyCode: amountPlanned?.currencyCode,
        },
        interactionId: response.id,
        timestamp: response.updatedAt,
        state: mapBraintreeStatusToCommercetoolsTransactionState(
          response.status
        ),
      },
    });
    updateActions = updateActions.concat(updatePaymentFields(response));
    return updateActions;
  } catch (e) {
    return handleError(
      'refund',
      e,
      paymentWithOptionalTransaction?.transaction?.id
    );
  }
}

function updatePaymentFields(response: Transaction): UpdateActions {
  const updateActions: UpdateActions = [];
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
}

async function submitForSettlement(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction
) {
  try {
    let updateActions: UpdateActions;
    const request = parseRequest(
      paymentWithOptionalTransaction,
      'submitForSettlementRequest',
      'Authorization'
    );
    updateActions = handleRequest('submitForSettlement', request);
    const response = await braintreeSubmitForSettlement(
      request.transactionId,
      request?.amount
    );
    updateActions = updateActions.concat(
      handleResponse(
        'submitForSettlement',
        response,
        paymentWithOptionalTransaction?.transaction?.id
      )
    );
    const amountPlanned = paymentWithOptionalTransaction.payment?.amountPlanned;
    updateActions.push({
      action: 'addTransaction',
      transaction: {
        type: 'Charge',
        amount: {
          centAmount: mapBraintreeMoneyToCommercetoolsMoney(
            response.amount,
            amountPlanned?.fractionDigits
          ),
          currencyCode: amountPlanned?.currencyCode,
        },
        interactionId: response.id,
        timestamp: response.updatedAt,
        state: mapBraintreeStatusToCommercetoolsTransactionState(
          response.status
        ),
      },
    });
    updateActions = updateActions.concat(updatePaymentFields(response));
    return updateActions;
  } catch (e) {
    return handleError(
      'submitForSettlement',
      e,
      paymentWithOptionalTransaction?.transaction?.id
    );
  }
}

async function voidTransaction(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction
) {
  try {
    let updateActions: UpdateActions;
    const request = parseRequest(
      paymentWithOptionalTransaction,
      'voidRequest',
      'Authorization'
    );
    updateActions = handleRequest('void', request);
    const response = await braintreeVoidTransaction(request.transactionId);
    updateActions = updateActions.concat(
      handleResponse(
        'void',
        response,
        paymentWithOptionalTransaction?.transaction?.id
      )
    );
    const amountPlanned = paymentWithOptionalTransaction.payment?.amountPlanned;
    updateActions.push({
      action: 'addTransaction',
      transaction: {
        type: 'CancelAuthorization',
        amount: {
          centAmount: mapBraintreeMoneyToCommercetoolsMoney(
            response.amount,
            amountPlanned?.fractionDigits
          ),
          currencyCode: amountPlanned?.currencyCode,
        },
        interactionId: response.id,
        timestamp: response.updatedAt,
        state: mapBraintreeStatusToCommercetoolsTransactionState(
          response.status
        ),
      },
    });
    updateActions = updateActions.concat(updatePaymentFields(response));
    return updateActions;
  } catch (e) {
    return handleError(
      'void',
      e,
      paymentWithOptionalTransaction?.transaction?.id
    );
  }
}

/**
 * Handle the update action
 *
 * @param {PaymentReference} paymentReference The payment from the request body
 * @returns {object}
 */
const update = async (paymentReference: PaymentReference) => {
  try {
    let updateActions: UpdateActions = [];
    const payment = paymentReference.obj;
    logger.info('Update payment called', payment);
    if (payment?.custom?.fields?.getClientTokenRequest) {
      const request: ClientTokenRequest = JSON.parse(
        payment.custom.fields.getClientTokenRequest
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
    if (payment?.custom?.fields?.transactionSaleRequest) {
      try {
        const request = parseTransactionSaleRequest(payment);
        updateActions = handleRequest('transactionSale', request);
        const response = await transactionSale(request);
        updateActions = updateActions.concat(
          handleResponse('transactionSale', response)
        );
        const amountPlanned = payment?.amountPlanned;
        updateActions.push({
          action: 'addTransaction',
          transaction: {
            type: mapBraintreeStatusToCommercetoolsTransactionType(
              response.status
            ),
            amount: {
              centAmount: mapBraintreeMoneyToCommercetoolsMoney(
                response.amount,
                amountPlanned?.fractionDigits
              ),
              currencyCode: amountPlanned?.currencyCode,
            },
            interactionId: response.id,
            timestamp: response.updatedAt,
            state: mapBraintreeStatusToCommercetoolsTransactionState(
              response.status
            ),
          },
        });
        if (!payment?.interfaceId) {
          updateActions.push({
            action: 'setInterfaceId',
            interfaceId: response.id,
          });
        }
        updateActions = updateActions.concat(updatePaymentFields(response));
      } catch (e) {
        updateActions = handleError('transactionSale', e);
      }
    }
    if (payment?.custom?.fields?.refundRequest) {
      updateActions = updateActions.concat(
        await refund({ payment } as PaymentWithOptionalTransaction)
      );
    }
    if (payment?.custom?.fields?.submitForSettlementRequest) {
      updateActions = updateActions.concat(
        await submitForSettlement({ payment } as PaymentWithOptionalTransaction)
      );
    }
    if (payment?.custom?.fields?.voidRequest) {
      updateActions = updateActions.concat(
        await voidTransaction({ payment } as PaymentWithOptionalTransaction)
      );
    }
    if (payment?.transactions) {
      const promises = payment.transactions.map(
        async (
          transaction: CommercetoolsTransaction
        ): Promise<UpdateActions> => {
          if (transaction?.custom?.fields?.refundRequest) {
            return await refund({
              payment,
              transaction,
            } as PaymentWithOptionalTransaction);
          }
          if (transaction?.custom?.fields?.submitForSettlementRequest) {
            return await submitForSettlement({
              payment,
              transaction,
            } as PaymentWithOptionalTransaction);
          }
          if (transaction?.custom?.fields?.voidRequest) {
            return await voidTransaction({
              payment,
              transaction,
            } as PaymentWithOptionalTransaction);
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
