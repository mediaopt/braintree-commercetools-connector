/**
 * See also braintree-extension customer service.
 */
import { Customer, CustomerSetCustomFieldAction, CustomerUpdateAction } from '@commercetools/connect-payments-sdk';

/* PURE_VAULT_DISABLED start
import {
 CustomerSetCustomFieldAction,
 ErrorInvalidOperation,
} from '@commercetools/connect-payments-sdk';

import {
 PaymentUpdateResponseSchemaDTO /*, PureVaultBaseSchemaDTO} from '../dtos/braintree-payment.dto';
import {
  createCustomer,
  createPaymentMethod,
  CustomerResponse,
  handleCustomerResponse,
  logger,
  mapCTCustomerToNewBraintreeCustomer,
  VAULT_BRAINTREE_OPTIONS,
} from 'common-connect';
import { CustomerCreateRequest, PaymentMethodCreateRequest } from 'braintree';
import { successGeneralResponse } from './constants';
PURE_VAULT_DISABLED end */

import { log } from '../libs/logger';

import { DefaultCommercetoolsAPI } from '@commercetools/connect-payments-sdk/dist/commercetools/api/root-api';

export type BraintreeCustomerServiceOptions = {
  ctAPI: DefaultCommercetoolsAPI;
};

export class BraintreeCustomerService {
  private ctAPI: DefaultCommercetoolsAPI;

  constructor(opts: BraintreeCustomerServiceOptions) {
    this.ctAPI = opts.ctAPI;
  }

  public async getCtCustomer(ctCustomerId: string): Promise<Customer | void> {
    return await this.ctAPI.client
      .customers()
      .withId({ ID: ctCustomerId })
      .get()
      .execute()
      .then((response) => response.body)
      .catch((err) => {
        log.warn(`Customer not found ${ctCustomerId}`, { error: err });
        return;
      });
  }

  public async updateCtCustomer(
    ctCustomerId: string,
    ctCustomerVersion: number,
    actions: CustomerUpdateAction[],
  ): Promise<Customer | void> {
    return await this.ctAPI.client
      .customers()
      .withId({ ID: ctCustomerId })
      .post({ body: { version: ctCustomerVersion, actions } })
      .execute()
      .then((response) => response.body)
      .catch((err) => {
        log.warn(`Could not update customer ${ctCustomerId}`, { error: err });
        return;
      });
  }

  public async linkBraintreeCustomerId(ctCustomerId: string, braintreeCustomerId: string): Promise<void> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000; //timing selected based on permitted time for resolve for payment connector operations
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const ctCustomer = await this.getCtCustomer(ctCustomerId);
      if (!ctCustomer || ctCustomer.custom?.fields?.braintreeCustomerId) return;
      const action: CustomerSetCustomFieldAction = {
        action: 'setCustomField',
        name: 'braintreeCustomerId',
        value: braintreeCustomerId,
      };
      const result = await this.updateCtCustomer(ctCustomer.id, ctCustomer.version, [action]);
      if (result) return;
      log.warn(`linkBraintreeCustomerId: attempt ${attempt}/${MAX_RETRIES} failed for customer ${ctCustomerId}`);
      if (attempt < MAX_RETRIES) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    log.error(
      `linkBraintreeCustomerId: all ${MAX_RETRIES} attempts failed for customer ${ctCustomerId}. ` +
        `Braintree customer ID "${braintreeCustomerId}" was not persisted to CT — stored payment methods will not be visible for this customer until resolved manually.`,
    );
  }

  /* PURE_VAULT_DISABLED start — pure vault cancelled; uncomment to re-enable
  public async pureVault({
    ctCustomerId,
    ctCustomerVersion,
    braintreeCustomerId,
    paymentMethodNonce,
    //braintree CustomerCreateRequest data (includes nonce) or braintree  PaymentMethodCreateRequest
  }: PureVaultBaseSchemaDTO): Promise<PaymentUpdateResponseSchemaDTO> {
    let response: CustomerResponse;
    let ctVersion = ctCustomerVersion;

    if (!braintreeCustomerId) {
      log.info(`customer ${ctCustomerId} doesn't have Braintree account associated yet. Linking account`);
      const ctCustomer = await this.getCtCustomer(ctCustomerId);
      if (!ctCustomer) throw new ErrorInvalidOperation(`Customer with id ${ctCustomerId} not found`);
      const braintreeCustomerCreateRequest: CustomerCreateRequest = {
        ...mapCTCustomerToNewBraintreeCustomer(ctCustomer),
        paymentMethodNonce,
      };
      response = await createCustomer(braintreeCustomerCreateRequest);
      ctVersion = ctCustomer.version;
    } else {
      log.info(`customer ${ctCustomerId} already has Braintree account associated. Adding payment method to account`);
      const braintreePaymentMethodCreateRequest: PaymentMethodCreateRequest = {
        customerId: braintreeCustomerId,
        options: VAULT_BRAINTREE_OPTIONS,
        paymentMethodNonce,
      };
      response = await createPaymentMethod(braintreePaymentMethodCreateRequest);
    }
    const updateActions: CustomerSetCustomFieldAction[] = handleCustomerResponse(
      'vault',
      response,
      !!braintreeCustomerId,
    );
    await this.updateCtCustomer(ctCustomerId, ctVersion, updateActions);
    return successGeneralResponse;
  }
  PURE_VAULT_DISABLED end */
}
