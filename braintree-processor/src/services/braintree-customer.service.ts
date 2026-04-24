/**
 * See also braintree-extension customer service.
 */
import { GeneralResponseSuccessSchemaDTO, PureVaultBaseSchemaDTO } from '../dtos/braintree-payment.dto';
import {
  Customer,
  CustomerSetCustomFieldAction,
  CustomerUpdateAction,
  ErrorInvalidOperation,
} from '@commercetools/connect-payments-sdk';
import {
  createCustomer,
  createPaymentMethod,
  CustomerResponse,
  handleCustomerResponse,
  mapCTCustomerToNewBraintreeCustomer,
  VAULT_BRAINTREE_OPTIONS,
} from 'common-connect';
import { CustomerCreateRequest, PaymentMethodCreateRequest } from 'braintree';
import { log } from '../libs/logger';
import { successGeneralResponse } from './constants';
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
  public async pureVault({
    ctCustomerId,
    ctCustomerVersion,
    braintreeCustomerId,
    paymentMethodNonce,
    //braintree CustomerCreateRequest data (includes nonce) or braintree  PaymentMethodCreateRequest
  }: PureVaultBaseSchemaDTO): Promise<GeneralResponseSuccessSchemaDTO> {
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
}
