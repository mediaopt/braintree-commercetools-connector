import {
  TransactionType,
  TransactionState,
  Transaction as CommercetoolsTransaction,
} from "@commercetools/platform-sdk";
import { CustomError } from "../errors/custom.error";
import { PaymentWithOptionalTransaction } from "../types/index.types";

export function findSuitableTransactionId(
  paymentWithOptionalTransaction: PaymentWithOptionalTransaction,
  type?: TransactionType,
  status?: TransactionState,
) {
  if (paymentWithOptionalTransaction?.transaction) {
    return paymentWithOptionalTransaction?.transaction.interactionId;
  }
  const transactions =
    paymentWithOptionalTransaction?.payment?.transactions.filter(
      (transaction: CommercetoolsTransaction): boolean =>
        (!type || transaction.type === type) &&
        (!status || status === transaction.state),
    );
  if (!transactions || transactions.length === 0) {
    throw new CustomError(500, "The payment has no suitable transaction");
  }
  return transactions[transactions.length - 1].interactionId;
}
