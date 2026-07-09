import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { createApiRoot } from '../client/create.client';
import { mapBraintreeStatusToCommercetoolsTransactionState } from '../utils/map.utils';
import {
  PaymentUpdateAction,
  OrderFromCartDraft,
  Payment,
  Transaction as CommercetoolsTransaction,
  ClientResponse,
} from '@commercetools/platform-sdk';
import { Transaction as BraintreeTransaction } from 'braintree';

const getPaymentByLocalPaymentMethodsPaymentId = async (
  paymentId: string
): Promise<Payment> => {
  const payments = await createApiRoot()
    .payments()
    .get({
      queryArgs: {
        where: `custom(fields(LocalPaymentMethodsPaymentId="${paymentId}"))`,
      },
    })
    .execute();

  const results = payments.body.results;
  if (results.length !== 1) {
    logger.error('There is not any assigned payment');
    throw new CustomError(
      400,
      'Bad request: There is not any assigned payment'
    );
  }

  logger.info(`payment ${JSON.stringify(results[0])}`);
  return results[0];
};

const getPaymentByBraintreeTransactionId = async (
  transactionId: string
): Promise<Payment> => {
  const payments = await createApiRoot()
    .payments()
    .get({
      queryArgs: {
        where: `interfaceId="${transactionId}"`,
      },
    })
    .execute();

  const results = payments.body.results;
  if (results.length !== 1) {
    logger.error(`There is not any assigned payment for transaction id ${transactionId}`);
    throw new CustomError(
      400,
      'Bad request: There is not any assigned payment'
    );
  }

  logger.info(`Found payment with id ${results[0].id} for transaction ${transactionId}`);
  return results[0];
};

const handleTransactionSale = async (
  paymentId: string,
  paymentVersion: number,
  paymentMethodNonce: string
): Promise<number> => {
  const transactionSaleResponse = await createApiRoot()
    .payments()
    .withId({ ID: paymentId })
    .post({
      body: {
        version: paymentVersion,
        actions: [
          {
            action: 'setCustomField',
            name: 'transactionSaleRequest',
            value: JSON.stringify({ paymentMethodNonce }),
          },
        ],
      },
    })
    .execute();

  if (!transactionSaleResponse) {
    logger.error('Error in sale transaction');
    throw new CustomError(400, 'Error in sale transaction');
  }

  logger.info(
    `transactionSaleResponse ${JSON.stringify(transactionSaleResponse)}`
  );

  return transactionSaleResponse.body.version;
};

const handleUpdatePayment = async (
  paymentId: string,
  paymentVersion: number,
  updateActions: PaymentUpdateAction[]
): Promise<ClientResponse<Payment>> => {
  logger.info(`updateActions ${JSON.stringify(updateActions)}`);

  const payment = await createApiRoot()
    .payments()
    .withId({ ID: paymentId })
    .post({
      body: {
        version: paymentVersion,
        actions: updateActions,
      },
    })
    .execute();

  if (!payment) {
    logger.error('Error in updating payment status');
    throw new CustomError(400, 'Error in updating payment status');
  }

  logger.info(`updatePaymentResult ${JSON.stringify(payment)}`);

  return payment;
};

const handleCheckout = async (paymentId: string, BraintreeOrderId: string) => {
  try {
    const carts = await createApiRoot()
      .carts()
      .get({
        queryArgs: {
          where: `paymentInfo(payments(id="${paymentId}"))`,
        },
      })
      .execute();
    logger.info(`carts ${JSON.stringify(carts)}`);

    if (carts.body.results.length === 1) {
      const { id, version } = carts.body.results[0];

      const orderFromCartDraft: OrderFromCartDraft = {
        id: id,
        version: +version,
        orderNumber: BraintreeOrderId,
      };

      logger.info(`orderFromCartDraft ${JSON.stringify(orderFromCartDraft)}`);

      const order = await createApiRoot()
        .orders()
        .post({
          body: orderFromCartDraft,
        })
        .execute();

      logger.info(`order ${JSON.stringify(order)}`);
    }
  } catch (error) {
    logger.error('Error in checkout');
    throw new CustomError(400, 'Error in checkout');
  }
};

export const handleLocalPaymentCompleted = async (
  paymentMethodNonce: string,
  paymentId: string
): Promise<void> => {
  const payment = await getPaymentByLocalPaymentMethodsPaymentId(paymentId);

  let runCheckout = false;
  let { version: paymentVersion, id: paymentActualId } = payment;

  if (payment.transactions.length === 0) {
    paymentVersion = await handleTransactionSale(
      paymentActualId,
      paymentVersion,
      paymentMethodNonce
    );
    runCheckout = true;
  }

  const updateActions: PaymentUpdateAction[] = [];
  updateActions.push({
    action: 'setStatusInterfaceCode',
    interfaceCode: 'completed',
  });
  updateActions.push({
    action: 'setStatusInterfaceText',
    interfaceText: 'completed',
  });
  await handleUpdatePayment(paymentActualId, paymentVersion, updateActions);

  const BraintreeOrderId = payment.custom?.fields.BraintreeOrderId;
  if (runCheckout && BraintreeOrderId) {
    await handleCheckout(paymentActualId, BraintreeOrderId);
  }
};

const findChargeTransaction = (
  payment: Payment,
  transactionId: string
): CommercetoolsTransaction | undefined =>
  payment.transactions.find(
    (transaction) =>
      transaction.interactionId === transactionId &&
      transaction.type === 'Charge'
  );

export const handleTransactionWebhook = async (
  transaction: BraintreeTransaction
): Promise<void> => {
  const payment = await getPaymentByBraintreeTransactionId(transaction.id);

  const ctTransaction = findChargeTransaction(payment, transaction.id);
  if (!ctTransaction) {
    logger.error(
      `There is not any charge transaction with Braintree transaction id ${transaction.id} for payment id ${payment.id}`
    );
    throw new CustomError(
      400,
      'Bad request: There is not any assigned transaction'
    );
  }

  const wasPending = ctTransaction.state === 'Pending';
  const newState = mapBraintreeStatusToCommercetoolsTransactionState(
    transaction.status
  );

  const updateActions: PaymentUpdateAction[] = [];
  if (ctTransaction.state !== newState) {
    updateActions.push({
      action: 'changeTransactionState',
      transactionId: ctTransaction.id,
      state: newState,
    });
  }
  updateActions.push({
    action: 'setStatusInterfaceCode',
    interfaceCode: transaction.status,
  });
  updateActions.push({
    action: 'setStatusInterfaceText',
    interfaceText: transaction.status,
  });

  await handleUpdatePayment(payment.id, payment.version, updateActions);

  const BraintreeOrderId = payment.custom?.fields.BraintreeOrderId;
  if (wasPending && newState === 'Success' && BraintreeOrderId) {
    await handleCheckout(payment.id, BraintreeOrderId);
  }
};
