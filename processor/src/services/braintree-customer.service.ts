/**
 * See also braintree-extension customer service.
 */
import { Customer, CustomerUpdateAction, ErrorInvalidOperation } from '@commercetools/connect-payments-sdk';

import {
  createCustomer,
  createPaymentMethod,
  findCustomer,
  mapCTCustomerToNewBraintreeCustomer,
  VAULT_BRAINTREE_OPTIONS,
} from 'common-connect';
import { Customer as BraintreeCustomer, PaymentMethod } from 'braintree';

/* PURE_VAULT_DISABLED start
import {
 PaymentUpdateResponseSchemaDTO /*, PureVaultBaseSchemaDTO} from '../dtos/braintree-payment.dto';
import { handleCustomerResponse, logger, CustomerResponse } from 'common-connect';
import { CustomerCreateRequest, PaymentMethodCreateRequest } from 'braintree';
import { successGeneralResponse } from './constants';
PURE_VAULT_DISABLED end */

import { log } from '../libs/logger';

import { getConfig } from '../config/config';
import { braintreeErrorRef, errorMessage } from '../utils/error.utils';
import { braintreeFailure, buildCallFields, CustomFields, getTypeId } from '../utils/customEntities.utils';

import { DefaultCommercetoolsAPI } from '@commercetools/connect-payments-sdk/dist/commercetools/api/root-api';

export type BraintreeCustomerServiceOptions = {
  ctAPI: DefaultCommercetoolsAPI;
};

// @types/braintree's PaymentMethodCreateRequest.options does support but doesn't declare usBankAccountVerificationMethod
const buildAchVaultOptions = () => ({
  ...VAULT_BRAINTREE_OPTIONS,
  usBankAccountVerificationMethod:
    getConfig().perMethodConfig?.ach?.usBankAccountVerificationMethod ??
    VAULT_BRAINTREE_OPTIONS.usBankAccountVerificationMethod,
});

const CUSTOMER_WRITE_ATTEMPTS = 3;
const CUSTOMER_WRITE_RETRY_DELAY_MS = 1000; //timing selected based on permitted time for resolve for payment connector operations

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
        log.warn(`Customer not found ${ctCustomerId} — ${errorMessage(err)}`);
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
        log.warn(`Could not update customer ${ctCustomerId} — ${errorMessage(err)}`);
        return;
      });
  }

  /**
   * Sets the `braintreeCustomerId` custom field on the CT Customer. Kept for backward compatibility
   * reasons with other modules (braintree-extension, braintree-commercetools-events) that read/write
   * this same field — see DOCS.md. ctPaymentMethodService (in braintree-payment.service.ts) is the
   * parallel, commercetools-native mechanism going forward; see the class-level note in
   * abstract-payment.service.ts. An existing link is never replaced (see setBraintreeCustomerFields).
   */
  public async linkBraintreeCustomerId(
    ctCustomerId: string,
    braintreeCustomerId: string,
    // records of the same request's Braintree calls, written in the same update so they never compete with the link
    recordFields: CustomFields = {},
  ): Promise<void> {
    const written = await this.setBraintreeCustomerFields(
      ctCustomerId,
      { ...recordFields, braintreeCustomerId },
      'linkBraintreeCustomerId',
    );
    if (!written)
      log.error(
        `linkBraintreeCustomerId: all ${CUSTOMER_WRITE_ATTEMPTS} attempts failed for customer ${ctCustomerId}. ` +
          `Braintree customer ID "${braintreeCustomerId}" was not persisted to CT — stored payment methods will not be visible for this customer until resolved manually.`,
      );
  }

  /**
   * Records a customer-level Braintree call on the CT customer ({messageName}ProcessorRequest + {messageName}Response,
   * as the payment-level calls are recorded on the payment). Fire-and-forget, best effort: a log, never required for
   * the operation itself.
   */
  public recordCustomerCall(ctCustomerId: string, messageName: string, request: unknown, response: unknown): void {
    this.recordCustomerFields(ctCustomerId, buildCallFields(messageName, request, response), messageName);
  }

  // Writes the record fields of one or more calls in one update; fire-and-forget like recordCustomerCall
  public recordCustomerFields(ctCustomerId: string, fields: CustomFields, messageNames: string): void {
    void this.setBraintreeCustomerFields(ctCustomerId, fields, `recordCustomerCall:${messageNames}`)
      .then((written) => {
        if (!written) log.warn(`recordCustomerCall: ${messageNames} not recorded on customer ${ctCustomerId}`);
      })
      .catch((err) =>
        log.warn(`recordCustomerCall: ${messageNames} not recorded on customer ${ctCustomerId} — ${errorMessage(err)}`),
      );
  }

  /**
   * Writes fields of the Braintree customer type on a CT customer, retried with a fresh read (a concurrent write of the
   * same customer fails on its version). A customer without a type gets the Braintree customer type; one with another
   * type is left alone — braintree-extension doesn't act on such a customer either, and the self-heal lookup
   * (findExistingBraintreeCustomerId) still finds the Braintree customer (same id). Only fields whose stored value
   * differs are written, so a repeated identical answer (e.g. the same Braintree customer on every checkout load) causes
   * no write. An existing braintreeCustomerId is never replaced: re-pointing the customer would hide its stored payment
   * methods. Resolves false only when every attempt failed; nothing to do (no customer, nothing changed, another type)
   * counts as done.
   */
  private async setBraintreeCustomerFields(
    ctCustomerId: string,
    fields: CustomFields,
    methodName: string,
  ): Promise<boolean> {
    const { customerTypeKey } = getConfig();
    for (let attempt = 1; attempt <= CUSTOMER_WRITE_ATTEMPTS; attempt++) {
      const [ctCustomer, customerTypeId] = await Promise.all([
        this.getCtCustomer(ctCustomerId),
        getTypeId(customerTypeKey).catch((err) => {
          log.warn(`${methodName}: could not resolve the customer type ${customerTypeKey} — ${errorMessage(err)}`);
          return undefined;
        }),
      ]);
      if (!ctCustomer) return true;
      if (customerTypeId && ctCustomer.custom && ctCustomer.custom.type.id !== customerTypeId) {
        log.warn(
          `${methodName}: customer ${ctCustomerId} has another custom type, ${Object.keys(fields).join(', ')} not stored`,
        );
        return true;
      }
      const storedFields = ctCustomer.custom?.fields ?? {};
      const changedFields = Object.fromEntries(
        Object.entries(fields).filter(
          ([name, value]) =>
            storedFields[name] !== value && !(name === 'braintreeCustomerId' && storedFields.braintreeCustomerId),
        ),
      );
      if (!Object.keys(changedFields).length) return true;
      // No custom type yet (e.g. braintree-extension not installed): set the Braintree customer type
      const actions: CustomerUpdateAction[] = ctCustomer.custom
        ? Object.entries(changedFields).map(([name, value]) => ({ action: 'setCustomField', name, value }))
        : [{ action: 'setCustomType', type: { typeId: 'type', key: customerTypeKey }, fields: changedFields }];
      // setCustomType uses the type's key; only an existing type needs its id (unresolved → can't tell, retry)
      const result =
        (!ctCustomer.custom || customerTypeId) &&
        (await this.updateCtCustomer(ctCustomer.id, ctCustomer.version, actions));
      if (result) return true;
      log.warn(`${methodName}: attempt ${attempt}/${CUSTOMER_WRITE_ATTEMPTS} failed for customer ${ctCustomerId}`);
      if (attempt < CUSTOMER_WRITE_ATTEMPTS)
        await new Promise((resolve) => setTimeout(resolve, CUSTOMER_WRITE_RETRY_DELAY_MS));
    }
    return false;
  }

  /**
   * Optimistic lookup used to self-heal a missing/stale `braintreeCustomerId`: resolves to the id of
   * a Braintree customer matching `ctCustomerId`, or undefined if none exists or the lookup fails.
   * Silent on failure by design — a miss is the expected, common case for a genuinely new customer,
   * not something worth a warning on every call.
   *
   * Not recorded here: the caller writes `recordFields` (the find record) together with the rest of its request's
   * customer writes, in one update — separate writes on the same customer would compete with linkBraintreeCustomerId.
   *
   * Public so transactionSale (braintree-payment.service.ts) can run the same check directly before
   * deciding whether to embed a Braintree "create customer" payload.
   */
  public async findExistingBraintreeCustomerId(
    ctCustomerId: string,
  ): Promise<{ braintreeCustomerId: string | undefined; recordFields: CustomFields }> {
    const request = { customerId: ctCustomerId };
    return findCustomer(ctCustomerId)
      .then((c) => ({ braintreeCustomerId: c.id, recordFields: buildCallFields('find', request, c) }))
      .catch((err) => ({
        braintreeCustomerId: undefined,
        recordFields: buildCallFields('find', request, braintreeFailure(err)),
      }));
  }

  /**
   * Vaults a payment method nonce under the given Braintree customer, creating the customer first
   * if needed. Adapted from the disabled pureVault() feature to return token and verified status
   * instead of a generic success response.
   *
   * Used by ACH vault: the bank account token is returned to the enabler so transactionSale can
   * reference it by token once the account is verified (Flow A — instant verification via Plaid),
   * or so CT payment can be set to Pending while the customer completes micro-deposit verification
   * (Flow B — delayed). See getAchVaultToken in braintree-payment.service.ts for details.
   *
   * `ctCustomerId` is the cart's customer; the Braintree customer id is read from that CT customer.
   */
  public async vaultPaymentMethodForCustomer({
    paymentMethodNonce,
    ctCustomerId,
  }: {
    paymentMethodNonce: string;
    ctCustomerId: string | undefined;
  }): Promise<{ token: string; verified: boolean; ctCustomerId: string }> {
    if (!ctCustomerId) {
      throw new ErrorInvalidOperation('a customer on the cart is required to vault a payment method');
    }

    // braintreeCustomerId is set by construction to equal the CT customer id whenever this connector
    // creates the Braintree customer (mapCTCustomerToNewBraintreeCustomer) — but this field was wiped
    // on connector redeploy. Optimistically look up a Braintree customer with a matching id, in parallel
    // with the CT customer read — used both to self-heal the missing-id case below and as a drift check
    // when braintreeCustomerId is already known.
    const [ctCustomer, existing] = await Promise.all([
      this.getCtCustomer(ctCustomerId),
      this.findExistingBraintreeCustomerId(ctCustomerId),
    ]);
    if (!ctCustomer) throw new ErrorInvalidOperation(`Customer ${ctCustomerId} not found`);
    const braintreeCustomerId: string | undefined = ctCustomer.custom?.fields?.braintreeCustomerId;
    const existingBtCustomerId = existing.braintreeCustomerId;

    // Every customer write of this request (find and vault records, the link) goes in one update, so they
    // never compete with each other for the customer's version
    const { recordFields } = existing;
    let paymentMethod: PaymentMethod | undefined;
    let resolvedCustomerId = braintreeCustomerId;

    try {
      if (!resolvedCustomerId) {
        if (existingBtCustomerId) {
          // createCustomer below passes an explicit id, which Braintree rejects with a validation error
          // if that id is already taken — a matching Braintree customer here means the redeploy-wipe bug
          // hit this customer, not that they're new, so re-link instead of attempting to create a duplicate.
          log.warn(
            `vaultPaymentMethodForCustomer: braintreeCustomerId missing for customer ${ctCustomerId} but a matching Braintree customer exists — re-linking`,
          );
          resolvedCustomerId = existingBtCustomerId;
        } else {
          // Creates a new Braintree customer and vaults the payment method in one call.
          // createCustomer already unwraps response.customer — returns BraintreeCustomer directly.
          const btCustomer = (await this.recordVault(
            { ...mapCTCustomerToNewBraintreeCustomer(ctCustomer), paymentMethodNonce },
            createCustomer,
            recordFields,
          )) as BraintreeCustomer;
          paymentMethod = btCustomer.paymentMethods?.[0] as PaymentMethod;
          resolvedCustomerId = btCustomer.id;
        }
      } else if (existingBtCustomerId && existingBtCustomerId !== resolvedCustomerId) {
        // braintreeCustomerId already known but doesn't match a Braintree customer with the CT customer's
        // id — informational only, doesn't change which customer we vault onto.
        log.warn(
          `vaultPaymentMethodForCustomer: braintreeCustomerId mismatch for customer ${ctCustomerId} — stored "${resolvedCustomerId}", found Braintree customer "${existingBtCustomerId}"`,
        );
      }

      // createCustomer above already vaults the nonce as part of customer creation; every other path
      // (found-existing or already-known customer) still needs this explicit call.
      paymentMethod ??= (await this.recordVault(
        { customerId: resolvedCustomerId, paymentMethodNonce, options: buildAchVaultOptions() },
        createPaymentMethod,
        recordFields,
      )) as PaymentMethod;
    } finally {
      // Fire-and-forget, also after a failed vault (its record, no link then)
      // Link the Braintree customer ID back to CT so stored payment methods work in future sessions — covers both the
      // re-link (found existing) and brand-new-customer cases above
      if (!braintreeCustomerId && resolvedCustomerId)
        void this.linkBraintreeCustomerId(ctCustomerId, resolvedCustomerId, recordFields);
      else this.recordCustomerFields(ctCustomerId, recordFields, 'find, vault');
    }

    if (!paymentMethod) throw new ErrorInvalidOperation('Braintree did not return a payment method after vaulting');

    // `verified` is a runtime field on UsBankAccount; @types/braintree does not declare it on PaymentMethod.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { token: paymentMethod.token, verified: (paymentMethod as any).verified === true, ctCustomerId };
  }

  /**
   * The vault call (createCustomer with the nonce, or createPaymentMethod), recorded as `vault` — braintree-extension's
   * name for the same step, so vaultResponse is shared with it. Its fields are added to `recordFields`, which the caller
   * writes on the CT customer.
   */
  private async recordVault<Request, Response>(
    request: Request,
    call: (request: Request) => Promise<Response>,
    recordFields: CustomFields,
  ): Promise<Response> {
    try {
      const response = await call(request);
      Object.assign(recordFields, buildCallFields('vault', request, response));
      return response;
    } catch (err) {
      // Logged again by the error handler; the duplicate is accepted, as this line gives depersonalized debug data
      // sufficient to request the necessary details
      log.error(`vault: Braintree call failed — ${braintreeErrorRef(err)}`);
      Object.assign(recordFields, buildCallFields('vault', request, braintreeFailure(err)));
      throw err;
    }
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
