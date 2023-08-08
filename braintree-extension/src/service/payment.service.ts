import {
  LocalPayment,
  LocalPaymentTransaction,
  PaymentInstrumentType,
  PaymentWithOptionalTransaction,
  UpdateActions,
} from '../types/index.types';
import {
  Payment,
  Transaction as CommercetoolsTransaction,
  TransactionType,
} from '@commercetools/platform-sdk';
import CustomError from '../errors/custom.error';
import {
  handleError,
  handlePaymentResponse,
  handleRequest,
} from '../utils/response.utils';
import {
  getClientToken,
  refund as braintreeRefund,
  submitForSettlement as braintreeSubmitForSettlement,
  transactionSale,
  voidTransaction as braintreeVoidTransaction,
  findTransaction as braintreeFindTransaction,
} from './braintree.service';
import {
  mapBraintreeMoneyToCommercetoolsMoney,
  mapBraintreeStatusToCommercetoolsTransactionState,
  mapBraintreeStatusToCommercetoolsTransactionType,
} from '../utils/map.utils';
import { ClientTokenRequest, Transaction, TransactionRequest } from 'braintree';
import { logger } from '../utils/logger.utils';

const CHANNEL_COMMERCETOOLS = 'commercetools';

function parseTransactionSaleRequest(payment: Payment): TransactionRequest {
  const transactionSaleRequest = payment?.custom?.fields.transactionSaleRequest;
  if (!transactionSaleRequest) {
    throw new CustomError(500, 'transactionSaleRequest is missing');
  }
  const amountPlanned = payment?.amountPlanned;
  if (!amountPlanned) {
    throw new CustomError(500, 'amountPlanned is missing');
  }
  let request;
  try {
    request = JSON.parse(transactionSaleRequest);
  } catch (e) {
    request = {
      paymentMethodNonce: transactionSaleRequest,
    };
  }
  request = {
    amount: String(
      amountPlanned.centAmount *
        Math.pow(10, -amountPlanned.fractionDigits || 0)
    ),
    merchantAccountId: process.env.BRAINTREE_MERCHANT_ACCOUNT || undefined,
    channel: CHANNEL_COMMERCETOOLS,
    orderId: payment?.custom?.fields?.BraintreeOrderId ?? undefined,
    options: {
      submitForSettlement: process.env.BRAINTREE_AUTOCAPTURE === 'true',
      storeInVaultOnSuccess: !!request?.customerId || !!request.customer?.id,
    },
    ...request,
  } as TransactionRequest;
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
    case 'apple_pay_card':
      return response?.applePayCard?.sourceDescription ?? '';
    default:
      return '';
  }
}

export async function refund(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction
) {
  if (!paymentWithOptionalTransaction.payment?.custom?.fields?.refundRequest) {
    return [];
  }
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
      handlePaymentResponse(
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

export async function submitForSettlement(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction
) {
  if (
    !paymentWithOptionalTransaction.payment?.custom?.fields
      ?.submitForSettlementRequest
  ) {
    return [];
  }
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
      handlePaymentResponse(
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

export async function voidTransaction(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction
) {
  if (!paymentWithOptionalTransaction.payment?.custom?.fields?.voidRequest) {
    return [];
  }
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
      handlePaymentResponse(
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

function handleLocalPaymentMethodTransactionResponse(
  payment: Payment,
  response: LocalPaymentTransaction
) {
  const localPayment: LocalPayment = response.localPayment;
  if (
    !payment?.custom?.fields?.LocalPaymentMethodsPaymentId &&
    localPayment.paymentId
  ) {
    return [
      {
        action: 'setCustomField',
        name: 'LocalPaymentMethodsPaymentId',
        value: localPayment.paymentId,
      },
    ];
  }
  return [];
}

function handleTransactionResponse(payment: Payment, response: Transaction) {
  let updateActions: UpdateActions = [];
  const amountPlanned = payment?.amountPlanned;
  const transaction = payment?.transactions?.find(
    (transaction) =>
      transaction.interactionId === response.id &&
      transaction.type ===
        mapBraintreeStatusToCommercetoolsTransactionType(response.status)
  );
  if (transaction) {
    if (
      transaction.state !==
      mapBraintreeStatusToCommercetoolsTransactionState(response.status)
    ) {
      updateActions.push({
        action: 'changeTransactionState',
        transactionId: transaction.id,
        state: mapBraintreeStatusToCommercetoolsTransactionState(
          response.status
        ),
      });
    }
  } else {
    updateActions.push({
      action: 'addTransaction',
      transaction: {
        type: mapBraintreeStatusToCommercetoolsTransactionType(response.status),
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
  }
  if (
    (response.paymentInstrumentType as PaymentInstrumentType) ===
    'local_payment'
  ) {
    updateActions = updateActions.concat(
      handleLocalPaymentMethodTransactionResponse(
        payment,
        response as LocalPaymentTransaction
      )
    );
  }
  if (!payment?.interfaceId) {
    updateActions.push({
      action: 'setInterfaceId',
      interfaceId: response.id,
    });
  }
  if (!payment?.custom?.fields?.BraintreeOrderId && response?.orderId) {
    updateActions.push({
      action: 'setCustomField',
      name: 'BraintreeOrderId',
      value: response.orderId,
    });
  }
  return updateActions.concat(updatePaymentFields(response));
}

export async function handleTransactionSaleRequest(payment?: Payment) {
  if (!payment?.custom?.fields?.transactionSaleRequest) {
    return [];
  }
  try {
    const request = parseTransactionSaleRequest(payment);
    let updateActions = handleRequest('transactionSale', request);
    const response = await transactionSale(request);
    updateActions = updateActions.concat(
      handlePaymentResponse('transactionSale', response),
      handleTransactionResponse(payment, response)
    );
    return updateActions;
  } catch (e) {
    return handleError('transactionSale', e);
  }
}

export async function handleGetClientTokenRequest(payment?: Payment) {
  if (!payment?.custom?.fields?.getClientTokenRequest) {
    return [];
  }
  let request: ClientTokenRequest = JSON.parse(
    payment.custom.fields.getClientTokenRequest
  );
  request = {
    merchantAccountId: process.env.BRAINTREE_MERCHANT_ACCOUNT || undefined,
    ...request,
  };
  const updateActions = handleRequest('getClientToken', request);
  try {
    const response = await getClientToken(request);
    return updateActions.concat(
      handlePaymentResponse('getClientToken', response)
    );
  } catch (e) {
    logger.error('Call to getClientToken resulted in an error', e);
    return handleError('getClientToken', e);
  }
}

export async function findTransaction(payment?: Payment) {
  const { findTransactionRequest, BraintreeOrderId } =
    payment?.custom?.fields ?? {};
  if (!payment || !findTransactionRequest) {
    return [];
  }
  try {
    const request = {
      orderId: BraintreeOrderId,
    };
    if (!request?.orderId) {
      throw new CustomError(500, 'orderId is missing');
    }
    const updateActions = handleRequest('findTransaction', request);
    const response = await braintreeFindTransaction(request.orderId);
    return updateActions.concat(
      handlePaymentResponse('findTransaction', response),
      handleTransactionResponse(payment, response)
    );
  } catch (e) {
    logger.error('Call to findTransaction resulted in an error', e);
    return handleError('findTransaction', e);
  }
}
