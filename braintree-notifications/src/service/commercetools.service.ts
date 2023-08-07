import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { transactionSale } from '../service/braintree.service';
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
  centAmount: number,
  paymentMethodNonce: string
) => {
  const request: TransactionRequest = {
    amount: (centAmount / 100).toString(),
    paymentMethodNonce: paymentMethodNonce,
    options: {
      submitForSettlement: true,
    },
  };

  return await transactionSale(request);
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
        queryArgs: {
          expand: [
            'lineItems[*].discountedPrice.includedDiscounts[*].discount',
            'discountCodes[*].discountCode',
            'paymentInfo.payments[*]',
          ],
        },
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

  const updateActions: PaymentUpdateAction[] = [];

  let runCheckout = false;

  if (payment.transactions.length === 0) {
    const transactionSaleResponse = await handleTransactionSale(
      payment.amountPlanned.centAmount,
      paymentMethodNonce
    );

    const amountPlanned = payment.amountPlanned;

    updateActions.push({
      action: 'addTransaction',
      transaction: {
        type: mapBraintreeStatusToCommercetoolsTransactionType(
          transactionSaleResponse.status
        ),
        amount: {
          centAmount: mapBraintreeMoneyToCommercetoolsMoney(
            transactionSaleResponse.amount,
            amountPlanned?.fractionDigits
          ),
          currencyCode: amountPlanned?.currencyCode,
        },
        interactionId: transactionSaleResponse.id,
        timestamp: transactionSaleResponse.updatedAt,
        state: mapBraintreeStatusToCommercetoolsTransactionState(
          transactionSaleResponse.status
        ),
      },
    });

    runCheckout = true;
  }

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
    payment.id,
    payment.version,
    updateActions
  );

  logger.info(`updatePaymentResult ${JSON.stringify(updatePaymentResult)}`);

  if (runCheckout) {
    await handleCheckout(payment.id);
  }
};
