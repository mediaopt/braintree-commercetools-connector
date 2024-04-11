import {
  Payment,
  Transaction,
  TransactionState,
  TransactionType,
} from '@commercetools/platform-sdk';

export const findSuitableTransactionId = (
  payment: Payment,
  type: TransactionType,
  status?: TransactionState
) => {
  const transactions = payment?.transactions.filter(
    (transaction: Transaction): boolean =>
      transaction.type === type && (!status || status === transaction.state)
  );
  if (!transactions || transactions.length === 0) {
    return undefined;
  }
  return transactions[transactions.length - 1].interactionId;
};
