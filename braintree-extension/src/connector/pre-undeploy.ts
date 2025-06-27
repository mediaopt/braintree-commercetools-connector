import * as dotenv from 'dotenv';
dotenv.config();

import { createApiRoot } from '../client/create.client';
import { assertError } from '../utils/assert.utils';
import {
  BRAINTREE_CUSTOMER_EXTENSION_KEY,
  BRAINTREE_CUSTOMER_TYPE_KEY,
  BRAINTREE_EXTENSION_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY,
  BRAINTREE_PAYMENT_TYPE_KEY,
  deleteExtensionIfExist,
  deleteOrUpdateCustomType,
} from './actions';

async function preUndeploy(): Promise<void> {
  const apiRoot = createApiRoot();
  await deleteExtensionIfExist(apiRoot, BRAINTREE_EXTENSION_KEY);
  await deleteExtensionIfExist(apiRoot, BRAINTREE_CUSTOMER_EXTENSION_KEY);
  await deleteOrUpdateCustomType(apiRoot, BRAINTREE_PAYMENT_TYPE_KEY);
  await deleteOrUpdateCustomType(
    apiRoot,
    BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY
  );
  await deleteOrUpdateCustomType(
    apiRoot,
    BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY
  );
  await deleteOrUpdateCustomType(apiRoot, BRAINTREE_CUSTOMER_TYPE_KEY);
}

async function run(): Promise<void> {
  try {
    await preUndeploy();
  } catch (error) {
    assertError(error);
    process.stderr.write(`Pre-undeploy failed: ${error.message}`);
    process.exitCode = 1;
  }
}

run();
