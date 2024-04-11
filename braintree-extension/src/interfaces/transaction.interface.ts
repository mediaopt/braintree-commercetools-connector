import {
  Transaction,
  TransactionGateway as BraintreeTransactionGateway,
  ValidatedResponse,
} from 'braintree';
import { Package } from '../types/index.types';

export interface TransactionGateway extends BraintreeTransactionGateway {
  packageTracking(
    transactionId: string,
    packageParam: Package,
    promise?: Promise<ValidatedResponse<Transaction>>
  ): Promise<ValidatedResponse<Transaction>>;
}
