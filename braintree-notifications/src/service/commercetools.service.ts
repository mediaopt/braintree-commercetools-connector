import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { TransactionRequest } from 'braintree';
import { createApiRoot } from '../client/create.client';
import {
  PaymentUpdateAction,
  OrderFromCartDraft,
} from '@commercetools/platform-sdk';
import {
  mapBraintreeMoneyToCommercetoolsMoney,
  mapBraintreeStatusToCommercetoolsTransactionState,
  mapBraintreeStatusToCommercetoolsTransactionType,
} from '../utils/map.utils';

const getPaymentByLocalPaymentMethodsPaymentId = async (paymentId: string) => {
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
    return;
  }

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

  logger.info(
    `transactionSaleResponse ${JSON.stringify(transactionSaleResponse)}`
  );

  return transactionSaleResponse.body.version;
};

const handleUpdatePayment = async (
  paymentId: string,
  paymentVersion: number,
  updateActions: PaymentUpdateAction[]
) => {
  return await createApiRoot()
    .payments()
    .withId({ ID: paymentId })
    .post({
      body: {
        version: paymentVersion,
        actions: updateActions,
      },
    })
    .execute();
};

const handleCheckout = async (paymentId: string) => {
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
      orderNumber: id,
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
};

export const handleLocalPaymentCompleted = async (
  paymentMethodNonce: string,
  paymentId: string
): Promise<void> => {
  const payment = await getPaymentByLocalPaymentMethodsPaymentId(paymentId);

  logger.info(`payment ${JSON.stringify(payment)}`);

  if (!payment) {
    logger.error('There is not any assigned payment');
    throw new CustomError(
      400,
      'Bad request: There is not any assigned payment'
    );
  }

  let runCheckout = false;
  let { version: paymentVersion, id: paymentActualId } = payment;

  if (payment.transactions.length === 0) {
    paymentVersion = await handleTransactionSale(
      paymentActualId,
      paymentVersion,
      paymentMethodNonce
    );

    if (!paymentVersion) {
      logger.error('Error in sale transaction');
      throw new CustomError(400, 'Error in sale transaction');
    }
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

  logger.info(`updateActions ${JSON.stringify(updateActions)}`);

  const updatePaymentResult = await handleUpdatePayment(
    paymentActualId,
    paymentVersion,
    updateActions
  );

  if (!updatePaymentResult) {
    logger.error('Error in updating payment status');
    throw new CustomError(400, 'Error in updating payment status');
  }

  logger.info(`updatePaymentResult ${JSON.stringify(updatePaymentResult)}`);

  if (runCheckout) {
    try {
      await handleCheckout(paymentActualId);
    } catch (error) {
      logger.error('Error in checkout');
      throw new CustomError(400, 'Error in checkout');
    }
  }
};
