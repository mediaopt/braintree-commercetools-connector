import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import {
  PaymentReference,
  Transaction as CommercetoolsTransaction,
} from '@commercetools/platform-sdk';
import {
  PaymentWithOptionalTransaction,
  UpdateActions,
} from '../types/index.types';
import {
  findTransaction,
  handleGetClientTokenRequest,
  handleTransactionSaleRequest,
  refund,
  submitForSettlement,
  voidTransaction,
  handlePayPalOrderRequest,
  addPackageTracking,
} from '../service/payment.service';

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
    updateActions = updateActions.concat(
      await handleGetClientTokenRequest(payment),
      await handleTransactionSaleRequest(payment),
      await handlePayPalOrderRequest(payment),
      await refund({ payment } as PaymentWithOptionalTransaction),
      await submitForSettlement({ payment } as PaymentWithOptionalTransaction),
      await findTransaction(payment),
      await voidTransaction({ payment } as PaymentWithOptionalTransaction),
      await addPackageTracking({ payment } as PaymentWithOptionalTransaction)
    );
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
    if (error instanceof Error) {
      throw new CustomError(
        400,
        `Internal server error on PaymentController: ${error.stack}`
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
