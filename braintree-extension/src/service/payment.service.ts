import {
  LocalPayment,
  LocalPaymentTransaction,
  PaymentInstrumentType,
  PaymentMethodCreateRequest,
  PaymentWithOptionalTransaction,
  UpdateActions,
} from '../types/index.types';
import {
  Payment,
  Transaction as CommercetoolsTransaction,
  TransactionType,
  TransactionState,
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
  createPaymentMethod,
  deletePayment as braintreeDeletePayment,
  addPackageTracking as braintreeAddPackageTracking,
} from './braintree.service';
import {
  mapBraintreeMoneyToCommercetoolsMoney,
  mapBraintreeStatusToCommercetoolsTransactionState,
  mapBraintreeStatusToCommercetoolsTransactionType,
  mapCommercetoolsMoneyToBraintreeMoney,
} from '../utils/map.utils';
import {
  ClientTokenRequest,
  Transaction,
  TransactionRequest,
  TransactionStatus,
} from 'braintree';
import { logger } from '../utils/logger.utils';
import { getCurrentTimestamp } from '../utils/data.utils';

const CHANNEL_COMMERCETOOLS = 'commercetoolsGmbH_SP_BT';

const getPayPalOrderPaymentToken = (payment: Payment) => {
  return findSuitableTransactionId({ payment }, 'Authorization', 'Initial');
};

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
  const storeInVaultOnSuccess =
    !!request?.storeInVaultOnSuccess ||
    !!request?.customerId ||
    !!request.customer?.id;
  request = {
    amount: mapCommercetoolsMoneyToBraintreeMoney(amountPlanned),
    merchantAccountId: process.env.BRAINTREE_MERCHANT_ACCOUNT || undefined,
    channel: CHANNEL_COMMERCETOOLS,
    orderId: payment?.custom?.fields?.BraintreeOrderId ?? undefined,
    options: {
      submitForSettlement: process.env.BRAINTREE_AUTOCAPTURE === 'true',
      storeInVaultOnSuccess: storeInVaultOnSuccess,
      storeShippingAddressInVault: storeInVaultOnSuccess && !!request.shipping,
      paypal: {
        description: process.env.BRAINTREE_PAYPAL_DESCRIPTION ?? undefined,
      },
    },
    ...request,
  } as TransactionRequest;
  if (!request?.paymentMethodNonce && !request?.paymentMethodToken) {
    request.paymentMethodToken = getPayPalOrderPaymentToken(payment);
  }
  return request;
}

function parseRequest(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction,
  requestField: string,
  transactionType?: TransactionType
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
  type?: TransactionType,
  status?: TransactionState
) {
  if (paymentWithOptionalTransaction?.transaction) {
    return paymentWithOptionalTransaction?.transaction.interactionId;
  }
  const transactions =
    paymentWithOptionalTransaction?.payment?.transactions.filter(
      (transaction: CommercetoolsTransaction): boolean =>
        (!type || transaction.type === type) &&
        (!status || status === transaction.state)
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

function parsePayPalOrderRequest(payment: Payment) {
  let request;
  const payPalOrderRequest = payment?.custom?.fields?.payPalOrderRequest;
  try {
    request = JSON.parse(payPalOrderRequest);
  } catch (e) {
    request = {
      paymentMethodNonce: payPalOrderRequest,
    };
  }
  return {
    customerId: payment?.customer?.id ?? undefined,
    ...request,
  } as PaymentMethodCreateRequest;
}

export async function handlePayPalOrderRequest(payment?: Payment) {
  if (!payment?.custom?.fields?.payPalOrderRequest) {
    return [];
  }
  try {
    const request = parsePayPalOrderRequest(payment);
    let updateActions: UpdateActions = handleRequest('payPalOrder', request);
    const response = await createPaymentMethod(request);
    updateActions = updateActions.concat(
      handlePaymentResponse('payPalOrder', response)
    );
    const amountPlanned = payment?.amountPlanned;
    updateActions.push({
      action: 'addTransaction',
      transaction: {
        type: 'Authorization',
        amount: amountPlanned,
        interactionId: response.token,
        timestamp: response.updatedAt,
        state: 'Initial',
      },
    });
    updateActions.push({
      action: 'setStatusInterfaceCode',
      interfaceCode: 'Initial',
    });
    updateActions.push({
      action: 'setStatusInterfaceText',
      interfaceText: 'Initial',
    });
    updateActions.push({
      action: 'setMethodInfoMethod',
      method: 'paypal_account',
    });
    return updateActions;
  } catch (e) {
    return handleError('payPalOrder', e);
  }
}

export async function addPackageTracking(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction
) {
  if (
    !paymentWithOptionalTransaction.payment?.custom?.fields
      ?.addPackageTrackingRequest
  ) {
    return [];
  }
  try {
    let updateActions: UpdateActions;
    const request = parseRequest(
      paymentWithOptionalTransaction,
      'addPackageTrackingRequest'
    );
    updateActions = handleRequest('addPackageTracking', request);
    const transactionId = request.transactionId;
    delete request.transactionId;
    const response = await braintreeAddPackageTracking(transactionId, request);
    updateActions = updateActions.concat(
      handlePaymentResponse(
        'addPackageTracking',
        response,
        paymentWithOptionalTransaction?.transaction?.id
      )
    );
    updateActions = updateActions.concat(updatePaymentFields(response));
    return updateActions;
  } catch (e) {
    logger.error(e);
    return handleError(
      'addPackageTracking',
      e,
      paymentWithOptionalTransaction?.transaction?.id
    );
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

async function deletePayment(
  paymentMethodToken: string,
  transaction: CommercetoolsTransaction
) {
  await braintreeDeletePayment(paymentMethodToken);
  return {
    amount: mapCommercetoolsMoneyToBraintreeMoney(transaction.amount),
    id: transaction.interactionId,
    status: 'voided' as TransactionStatus,
    updatedAt: getCurrentTimestamp(),
  } as Transaction;
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
    const transaction =
      paymentWithOptionalTransaction?.payment?.transactions?.find(
        (transaction) =>
          transaction.interactionId === request.transactionId &&
          transaction.type === 'Authorization'
      );
    const response =
      transaction?.state === 'Initial'
        ? await deletePayment(request.transactionId, transaction)
        : await braintreeVoidTransaction(request.transactionId);
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
  const transactionType =
    response.type === 'credit'
      ? 'Refund'
      : mapBraintreeStatusToCommercetoolsTransactionType(response.status);
  const transaction = payment?.transactions?.find(
    (transaction) =>
      transaction.interactionId === response.id &&
      transaction.type === transactionType
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
        type: transactionType,
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
      ...response.map((transaction) =>
        handleTransactionResponse(payment, transaction)
      )
    );
  } catch (e) {
    logger.error('Call to findTransaction resulted in an error', e);
    return handleError('findTransaction', e);
  }
}
