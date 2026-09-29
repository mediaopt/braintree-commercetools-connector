import {
  statusHandler,
  healthCheckCommercetoolsPermissions,
  ErrorRequiredField,
  ErrorInvalidOperation,
  ErrorGeneral,
  Cart,
  Customer,
  Payment,
  CustomFieldsDraft,
} from '@commercetools/connect-payments-sdk';

import { CustomerResourceIdentifier } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/customer';
import {
  ShippingMethod,
  CentPrecisionMoney,
  TransactionType,
  TransactionState,
  PaymentUpdateAction,
  CartSetShippingAddressAction,
  CartSetShippingMethodAction,
} from '@commercetools/platform-sdk';
import { Transaction, TransactionRequest } from 'braintree';

import {
  CancelPaymentRequest,
  ConfigResponse,
  ModifyPaymentWithTransactionRequest,
  StatusResponse,
} from './types/operation.type';

import { SupportedPaymentComponentsSchemaDTO } from '../dtos/operations/payment-componets.dto';
import { PaymentIntentResponseSchemaDTO, PaymentModificationStatus } from '../dtos/operations/payment-intents.dto';
import packageJSON from '../../package.json';

import { AbstractPaymentService } from './abstract-payment.service';
import { getConfig } from '../config/config';
import { appLogger, paymentSDK } from '../payment-sdk';
import { BraintreePaymentServiceOptions } from './types/braintree-payment.type';
import {
  PaymentUpdateResponseSchemaDTO,
  PaymentMethodType,
  LocalPaymentMethodType,
  PaymentRequestSchemaDTO,
  PaymentResponseSchemaDTO,
  // PURE_VAULT_DISABLED: PureVaultRequestSchemaDTO,
  TransactionSaleRequestSchemaDTO,
  UpdateCartShippingResponseSchemaDTO,
  UpdateCartShippingRequestSchemaDTO,
  AchVaultTokenRequestSchemaDTO,
  AchVaultTokenResponseSchemaDTO,
} from '../dtos/braintree-payment.dto';
import { StoredPaymentMethodsResponse } from '../dtos/stored-payment-methods.dto';
import {
  getCartIdFromContext,
  getCheckoutTransactionItemIdFromContext,
  getMerchantReturnUrlFromContext,
} from '../libs/fastify/context/context';
import { getStoredPaymentMethodsConfig } from '../config/stored-payment-methods.config';

import { log } from '../libs/logger';
import {
  getBraintreeGateway,
  handleInterfaceInteraction,
  getClientToken,
  mapCommercetoolsMoneyToBraintreeMoney,
  mapRequestToBraintreeTransactionSale,
  transactionSale,
  mapBraintreeTransactionToCommercetoolsTransaction,
  mapBraintreeStatusToCommercetoolsTransactionState,
  submitForSettlement,
  getPaymentMethodHint,
  refund as braintreeRefund,
  voidTransaction as braintreeVoidTransaction,
  deletePayment as braintreeDeletePayment,
  getTransaction as braintreeGetTransaction,
  mapBraintreeMoneyToCommercetoolsMoney,
  getCurrentTimestamp,
  logger,
} from 'common-connect/dist';
import { handleCustomTransactionFields, handleCustomFieldResponse } from '../utils/customEntities.utils';

import { LineItemKind, mapCTLineItemToBraintreeLineItem, lineItemPlaceholders } from '../utils/lineItem.utils';
import { toNum } from '../utils/money.utils';
import {
  errorMessage,
  getCtErrorKind,
  retryCTSync,
  formatBraintreeSyncContext,
  warnOnFieldMismatch,
} from '../utils/error.utils';
import {
  mapCTShippingToBraintreeShipping,
  mapShippingMethodsToBraintreeShippingOptions,
} from '../utils/shipping.utils';
import {
  mapBraintreeCreditCardToStoredPaymentMethod,
  // mapBraintreePaypalAccountToStoredPaymentMethod,
  // mapBraintreeUsBankAccountToStoredPaymentMethod,
} from '../utils/storedPaymentMethod.utils';
import { toPaymentMethodIconKey } from '../utils/paymentMethodIcon.utils';
import {
  buildPlaceholderInteractionId,
  isPlaceholderInteractionId,
  findCapturedChargeBalance,
  findTransactionIdOrUndefined,
  hasCancelledPlaceholder,
  remainingRefundableCentAmount,
} from '../utils/transaction.utils';
import { BraintreeCustomerService } from './braintree-customer.service';

// localPayment is an undocumented field Braintree adds to Transaction for local payment methods
// See: https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side/javascript/v3
type TransactionWithLocalPayment = Transaction & {
  localPayment?: { paymentId?: string };
};

export class BraintreePaymentService extends AbstractPaymentService {
  private braintreeCustomerService: BraintreeCustomerService;

  constructor(opts: BraintreePaymentServiceOptions) {
    super(opts.ctCartService, opts.ctPaymentService, opts.ctPaymentMethodService);
    this.braintreeCustomerService = new BraintreeCustomerService({ ctAPI: paymentSDK.ctAPI });
  }

  /**
   * Helper method to ensure that all relevant fields will be included for update payment state with transaction involved
   */

  private async updatePaymentWithTransaction({
    messageName,
    request,
    ctPayment,
    response,
    customFields,
    transactionTypeOverride,
  }: {
    messageName: string;
    request: string | object;
    ctPayment: Payment;
    response: Transaction;
    customFields?: CustomFieldsDraft;
    transactionTypeOverride?: TransactionType;
  }): Promise<void> {
    const requestInteraction = handleInterfaceInteraction({
      messageName,
      message: request,
      messageType: 'ProcessorRequest',
    });
    const responseInteraction = handleInterfaceInteraction({
      messageName,
      message: response,
      messageType: 'Response',
    });
    const mappedTransaction = mapBraintreeTransactionToCommercetoolsTransaction(ctPayment, response);
    const transaction = transactionTypeOverride
      ? { ...mappedTransaction, type: transactionTypeOverride }
      : mappedTransaction;
    // A placeholder (ACH micro-deposit, Pending state, BraintreePlaceholder-marker interactionId — see
    // transaction.utils.ts) is overwritten in place via a raw CT call instead of going through
    // ctPaymentService.updatePayment(): that wrapped helper's own transaction-matching only ever reuses an
    // existing *Initial*-state transaction, so it would add a second, duplicate transaction rather than
    // recognizing this one. A raw call also has no "won't overwrite an existing interactionId" restriction,
    // so it can freely replace the placeholder marker with the real Braintree transaction id.
    // Detected on the flow's payment snapshot (no extra round-trip for the common no-placeholder case), then
    // re-checked on a fresh fetch for the raw call's version — if a previous retryCTSync attempt already
    // overwrote it, the placeholder is gone and must not be re-added as a new transaction either.
    const isPlaceholderFor = (t: Payment['transactions'][number]) =>
      t.type === transaction.type && isPlaceholderInteractionId(t.interactionId);
    const hadPlaceholder = ctPayment.transactions.some(isPlaceholderFor);
    const freshPayment = hadPlaceholder ? await this.ctPaymentService.getPayment({ id: ctPayment.id }) : undefined;
    const placeholder = freshPayment?.transactions.find(isPlaceholderFor);
    if (freshPayment && placeholder) {
      await paymentSDK.ctAPI.client
        .payments()
        .withId({ ID: ctPayment.id })
        .post({
          body: {
            version: freshPayment.version,
            actions: [
              { action: 'changeTransactionState', transactionId: placeholder.id, state: transaction.state },
              { action: 'changeTransactionInteractionId', transactionId: placeholder.id, interactionId: response.id },
            ],
          },
        })
        .execute();
    }
    await this.ctPaymentService.updatePayment({
      id: ctPayment.id,
      customFields,
      pspInteractions: [requestInteraction, responseInteraction],
      ...(hadPlaceholder ? {} : { transaction }),
      pspReference: response.id,
    });
    // Braintree's real status can naturally map to something other than the CT Checkout override
    // (e.g. autocapture -> Charge). Record that too (same interactionId) so CT's amountPaid and
    // refundPayment's findSuitableTransactionId(..., 'Charge') fallback see Braintree's actual state,
    // not just the Authorization entry above. Skipped for failed sales — a single Authorization/Failure
    // record is enough; there's no additional progression to reflect.
    if (
      transactionTypeOverride &&
      mappedTransaction.type !== transactionTypeOverride &&
      mappedTransaction.state !== 'Failure'
    ) {
      await this.ctPaymentService.updatePayment({ id: ctPayment.id, transaction: mappedTransaction });
    }
    // Backward compat with extension's updatePaymentFields (common-connect/src/utils/response.utils.ts):
    // setStatusInterfaceCode, setStatusInterfaceText, setMethodInfoMethod are not supported by the CT
    // Checkout SDK and must be applied via a raw CT API call. Own retryCTSync block so a failure here
    // does not cause the first update above to be re-attempted by the outer retryCTSync.
    const paymentMethodHint = getPaymentMethodHint(response);
    await retryCTSync(
      () =>
        this.syncCtPaymentStatus({
          ctPaymentId: ctPayment.id,
          interfaceCode: response.status,
          interfaceText: response.status,
          method: `${response.paymentInstrumentType}${paymentMethodHint ? ` (${paymentMethodHint})` : ''}`,
        }),
      `${messageName}:statusSync`,
      ctPayment.id,
      formatBraintreeSyncContext(response),
    );
  }

  /**
   * Applies setStatusInterfaceCode/setStatusInterfaceText/setMethodInfoMethod via a raw CT API call
   * (not supported by the CT Checkout SDK), optionally ensuring a placeholder transaction exists.
   * Re-fetches the payment version on every call so retries avoid version-conflict failures;
   * callers are expected to wrap this in retryCTSync themselves.
   *
   * `ensureTransaction` adds a placeholder transaction (BraintreePlaceholder-marker interactionId, see
   * transaction.utils.ts) that updatePaymentWithTransaction later overwrites in place once the real
   * Braintree transaction exists. It only adds the transaction if the payment has no transaction of that type yet —
   * neither a placeholder from a prior attempt (retryCTSync re-running after a server-side success the client saw as a
   * transient failure; addTransaction itself has no dedup key) nor a real one already written by transactionSale.
   */
  private async syncCtPaymentStatus({
    ctPaymentId,
    interfaceCode,
    interfaceText,
    method,
    ensureTransaction,
  }: {
    ctPaymentId: string;
    interfaceCode: string;
    interfaceText: string;
    method: string;
    ensureTransaction?: { type: TransactionType; state: TransactionState };
  }): Promise<void> {
    const payment = await this.ctPaymentService.getPayment({ id: ctPaymentId });
    // Any transaction of that type counts, not just a placeholder: a real one (written by a transactionSale that got
    // there first) must not get a second, forever-Pending placeholder next to it.
    const hasTransactionOfType =
      ensureTransaction && payment.transactions.some((transaction) => transaction.type === ensureTransaction.type);
    const extraActions: PaymentUpdateAction[] =
      ensureTransaction && !hasTransactionOfType
        ? [
            {
              action: 'addTransaction',
              transaction: {
                type: ensureTransaction.type,
                state: ensureTransaction.state,
                interactionId: buildPlaceholderInteractionId(ctPaymentId),
                amount: {
                  centAmount: payment.amountPlanned.centAmount,
                  currencyCode: payment.amountPlanned.currencyCode,
                },
              },
            },
          ]
        : [];
    await paymentSDK.ctAPI.client
      .payments()
      .withId({ ID: ctPaymentId })
      .post({
        body: {
          version: payment.version,
          actions: [
            { action: 'setStatusInterfaceCode', interfaceCode },
            { action: 'setStatusInterfaceText', interfaceText },
            { action: 'setMethodInfoMethod', method },
            ...extraActions,
          ],
        },
      })
      .execute();
  }

  /**
   * Get configurations
   *
   * @remarks
   * Implementation to provide mocking configuration information
   *
   * @returns Promise with mocking object containing configuration information
   */
  public async config(): Promise<ConfigResponse> {
    try {
      const config = getConfig();
      if (!config.buttonStyleOverrides?.ach?.mandateText && !config.perMethodConfig?.ach?.businessName) {
        logger.warn(
          'config: neither BRAINTREE_BUTTON_STYLES.ach.mandateText nor BRAINTREE_PER_METHOD_CONFIG.ach.businessName is set — ' +
            'the ACH mandate text will omit the "on behalf of [business name]" clause entirely',
        );
      }
      const result = {
        returnUrl: config.returnUrl,
        environment: config.braintreeEnvironment,
        storedPaymentMethodsConfig: {
          isEnabled: await this.isStoredPaymentMethodsEnabled(),
        },
        enableVaulting: config.enableVaulting,
        buttonStyleOverrides: config.buttonStyleOverrides,
        perMethodConfig: config.perMethodConfig,
      };
      logger.info('config: success');
      return result;
    } catch (e) {
      logger.error(`config: failed — ${errorMessage(e)}`);
      throw e;
    }
  }

  // Displaying the Venmo username in the checkout UI is the merchant's responsibility.
  // After a successful Venmo payment, venmoUsername is appended to the merchantReturnUrl
  // as a query parameter. The merchant's return page should read this value from the URL.
  //
  // Note: this is purely for the redirect — it's not the only place the username ends up.
  // getPaymentMethodHint(response) already reads response.venmoAccount.username independently
  // (Braintree's own transaction record, not this enabler-supplied value) and syncCtPaymentStatus
  // writes it into the CT Payment's native paymentMethodInfo.method field for every Venmo
  // transaction, with no extra plumbing needed here.
  private buildRedirectMerchantUrl(
    paymentReference: string,
    paymentStatus?: string,
    venmoUsername?: string,
  ): string | undefined {
    const merchantReturnUrl = getMerchantReturnUrlFromContext() || getConfig().returnUrl;
    if (!merchantReturnUrl?.length) return undefined;
    const redirectUrl = new URL(merchantReturnUrl);

    redirectUrl.searchParams.append('paymentReference', paymentReference);
    if (paymentStatus) {
      redirectUrl.searchParams.append('paymentStatus', paymentStatus);
    }
    if (venmoUsername) {
      redirectUrl.searchParams.append('venmoUsername', venmoUsername);
    }
    return redirectUrl.toString();
  }

  private paymentActionSuccessResponse(
    paymentReference: string,
    paymentStatus?: string,
    venmoUsername?: string,
  ): PaymentUpdateResponseSchemaDTO {
    const message = venmoUsername
      ? `Payment ${paymentReference} successful. Venmo: ${venmoUsername}`
      : `Payment ${paymentReference} successful`;
    return {
      success: true,
      message,
      paymentReference,
      merchantReturnUrl: this.buildRedirectMerchantUrl(paymentReference, paymentStatus, venmoUsername),
    };
  }

  // Payment Intents API response — outcome derived from the same CT transaction state written for this Braintree result
  private toPaymentIntentResponse(response: Transaction): PaymentIntentResponseSchemaDTO {
    const state = mapBraintreeStatusToCommercetoolsTransactionState(response.status);
    const outcome =
      state === 'Success'
        ? PaymentModificationStatus.APPROVED
        : state === 'Failure'
          ? PaymentModificationStatus.REJECTED
          : PaymentModificationStatus.RECEIVED;
    return { outcome };
  }

  /**
   * Payment Intents rule: an operation that is impossible in the payment's current state (nothing suitable to act on,
   * already fully refunded, a Braintree status that can't be reversed, ...) is answered with the `rejected`
   * PaymentIntentOutcome (docs.commercetools.com/checkout/payment-intents-api#paymentintentoutcome),
   * the connector itself logs it as an error with the payment id, requested operation and reason.
   */
  private rejectPaymentIntent(paymentId: string, operation: string, reason: string): PaymentIntentResponseSchemaDTO {
    logger.error(`${operation}: rejected, paymentId: ${paymentId} — ${reason}`);
    return { outcome: PaymentModificationStatus.REJECTED };
  }

  /**
   * Indicates if the feature stored payment methods is enabled/available.
   * It can be enhanced with further checks if so required.
   */
  async isStoredPaymentMethodsEnabled(): Promise<boolean> {
    if (!getStoredPaymentMethodsConfig().enabled) {
      return false;
    }

    const ctCart = await this.ctCartService.getCart({
      id: getCartIdFromContext(),
    });

    return ctCart.customerId !== undefined;
  }

  /**
   * Get status
   *
   * @remarks
   * Implementation to provide mocking status of external systems
   *
   * @returns Promise with mocking data containing a list of status from different external systems
   */
  public async status(): Promise<StatusResponse> {
    try {
      const requiredPermissions = [
        'manage_payments',
        'view_sessions',
        'view_api_clients',
        'manage_orders',
        'introspect_oauth_tokens',
        'manage_checkout_payment_intents',
        'manage_types',
      ];

      if (getStoredPaymentMethodsConfig().enabled) {
        requiredPermissions.push('manage_payment_methods');
      }

      const handler = await statusHandler({
        log: appLogger,
        timeout: getConfig().healthCheckTimeout,
        checks: [
          healthCheckCommercetoolsPermissions({
            requiredPermissions,
            ctAuthorizationService: paymentSDK.ctAuthorizationService,
            projectKey: getConfig().projectKey,
          }),
          async () => {
            try {
              await getBraintreeGateway();
              return {
                name: 'Braintree gateway',
                status: 'UP',
                message: 'Braintree healthcheck success',
                details: {},
              };
            } catch (e) {
              return {
                name: 'Braintree gateway',
                status: 'DOWN',
                message:
                  'Braintree gateway is not responding. Please check the Braintree merchant status and credentials.',
                details: {
                  error: e,
                },
              };
            }
          },
        ],
        metadataFn: async () => ({
          name: packageJSON.name,
          description: 'Braintree provider integration', //packageJSON.description, todo - fix the description missing on type package json
          '@commercetools/connect-payments-sdk': packageJSON.dependencies['@commercetools/connect-payments-sdk'],
        }),
      })();

      return handler.body;
    } catch (e) {
      logger.error(`status: failed — ${errorMessage(e)}`);
      throw e;
    }
  }

  /**
   * Get supported payment components
   *
   * @remarks
   * Implementation to provide the mocking payment components supported by the processor.
   *
   * @returns Promise with mocking data containing a list of supported payment components
   */
  public async getSupportedPaymentComponents(): Promise<SupportedPaymentComponentsSchemaDTO> {
    const hasMerchantAccount = !!getConfig().merchantAccountId;
    const localComponents = hasMerchantAccount
      ? Object.values(LocalPaymentMethodType).map((type) => ({ type: toPaymentMethodIconKey(type) }))
      : [];
    return {
      dropins: [],
      components: [
        // ACH requires vaulting to a customer account, but this discovery endpoint is
        // JWT-authenticated (no cart/customer in context) so that can't be checked here —
        // merchants restrict ACH to logged-in customers via a `customerId != null` payment
        // integration predicate in the merchant center instead (see README).
        { type: toPaymentMethodIconKey(PaymentMethodType.ACH) },
        { type: toPaymentMethodIconKey(PaymentMethodType.APPLE_PAY) },
        { type: toPaymentMethodIconKey(PaymentMethodType.CREDIT_CARD) },
        { type: toPaymentMethodIconKey(PaymentMethodType.GOOGLE_PAY) },
        { type: toPaymentMethodIconKey(PaymentMethodType.PAYPAL) },
        { type: toPaymentMethodIconKey(PaymentMethodType.VENMO) },
        ...localComponents,
      ],
      express: [
        { type: toPaymentMethodIconKey(PaymentMethodType.PAYPAL) },
        // PURE_VAULT_DISABLED: { type: toPaymentMethodIconKey(PaymentMethodType.PAYPAL_VAULT) },
        // PURE_VAULT_DISABLED: { type: toPaymentMethodIconKey(PaymentMethodType.CREDIT_CARD_VAULT) },
      ],
    };
  }

  public async getShippingMethods(ctCartId: string): Promise<ShippingMethod[] | void> {
    // Express always lets the buyer pick any address inside the PayPal popup regardless of the
    // cart's starting address/country (enableShippingAddress is hardcoded true for Express), so the
    // candidate pool is intentionally unscoped — the enabler filters by country client-side once an
    // address is actually chosen. This is Express-only (see the isExpress call site below).
    return await paymentSDK.ctAPI.client
      .shippingMethods()
      .get({ queryArgs: { expand: 'zoneRates[*].zone' } })
      .execute()
      .then((response) => response.body.results)
      .catch((err) => {
        if (getCtErrorKind(err) === 'auth') {
          logger.error(`getShippingMethods: CT auth error for cart ${ctCartId}`);
        } else {
          logger.warn(`getShippingMethods: no shipping available for cart ${ctCartId} — ${errorMessage(err)}`);
        }
        return;
      });
  }

  /**
   * Returns a Braintree client token only — no CT Payment is created or stored. Used to render the
   * PayPal Express button before the real (post-click) cart exists. The session's cart, if any, is
   * read only to opportunistically resolve a known customer for vaulted-method display — a missing
   * or invalid session/cart falls back to an anonymous token rather than failing the request, since
   * a Braintree client token alone is safe to issue without one.
   *
   * This token is a throwaway bootstrap value: it is never persisted, and createPayment (below) fetches
   * an entirely independent client token once the real CT Payment exists — that later token, not this
   * one, is what actually gets stored via handleCustomFieldResponse('getClientToken', ...).
   */
  public async getExpressClientToken(): Promise<{
    braintreeData: { clientToken: string; braintreeCustomerId?: string };
  }> {
    const merchantAccountId = getConfig().merchantAccountId;
    let braintreeCustomerId: string | undefined;
    try {
      const cartId = getCartIdFromContext();
      const ctCart = await this.ctCartService.getCart({ id: cartId });
      const customer = ctCart.customerId
        ? await this.braintreeCustomerService.getCtCustomer(ctCart.customerId)
        : undefined;
      braintreeCustomerId = customer?.custom?.fields.braintreeCustomerId;
    } catch (err) {
      logger.info(`getExpressClientToken: no cart-bound session, issuing anonymous token — ${errorMessage(err)}`);
    }
    const clientToken = await getClientToken({ merchantAccountId, customerId: braintreeCustomerId });
    return { braintreeData: { clientToken, braintreeCustomerId } };
  }

  /**
   * Create payment
   *
   * @remarks
   * Implementation to provide the mocking data for payment creation in external PSPs
   *
   * @param request - contains paymentType defined in composable commerce
   * @returns Promise with mocking data containing operation status and PSP reference
   */

  public async createPayment({
    builderType,
    paymentMethodType,
  }: PaymentRequestSchemaDTO): Promise<PaymentResponseSchemaDTO> {
    const merchantAccountId = getConfig().merchantAccountId;
    this.validatePaymentMethod(paymentMethodType, merchantAccountId);
    // PURE_VAULT_DISABLED: isPureVault detection disabled; feature cancelled
    const isPureVault = false;
    const isExpress = paymentMethodType === 'PayPal' && builderType === 'express';
    const cartId = getCartIdFromContext();
    try {
      const ctCart = await this.ctCartService.getCart({
        id: cartId,
      });
      this.validateCartRequiredData(ctCart, !(isPureVault || isExpress)); // PURE_VAULT_DISABLED: unreachable

      const customerPaymentInfo: { customer: CustomerResourceIdentifier } | { anonymousId?: string } = ctCart.customerId
        ? {
            customer: {
              typeId: 'customer',
              id: ctCart.customerId,
            },
          }
        : {
            anonymousId: ctCart.anonymousId,
          };

      const lastPaymentRef = !isPureVault // PURE_VAULT_DISABLED: unreachable
        ? ctCart.paymentInfo?.payments?.[ctCart.paymentInfo.payments.length - 1]
        : undefined;

      // Execute all optional data fetching in parallel
      const [customer, shippingMethodsResult, amountPlanned, existingPayment] = await Promise.all([
        ctCart.customerId ? this.braintreeCustomerService.getCtCustomer(ctCart.customerId) : Promise.resolve(undefined),
        isExpress ? this.getShippingMethods(ctCart.id) : Promise.resolve([]),
        this.ctCartService.getPaymentAmount({ cart: ctCart }), // PURE_VAULT_DISABLED: isPureVault ? ctCart.totalPrice :
        lastPaymentRef ? this.ctPaymentService.getPayment({ id: lastPaymentRef.id }) : Promise.resolve(undefined),
      ]);

      /* PURE_VAULT_DISABLED start
    this.validateCustomerRequiredData(customer, isPureVault);
     PURE_VAULT_DISABLED end */

      const braintreeCustomerId = customer?.custom?.fields.braintreeCustomerId;
      const shippingMethods = shippingMethodsResult || [];

      const { payment: reusedPayment, tokenRecentlyUpdated } = this.existingPaymentAndToken(
        existingPayment,
        amountPlanned,
      );

      const [newPayment, clientToken] = await Promise.all([
        reusedPayment
          ? Promise.resolve()
          : this.ctPaymentService.createPayment({
              amountPlanned,
              paymentMethodInfo: { paymentInterface: getConfig().paymentInterface },
              ...customerPaymentInfo,
              paymentStatus: { interfaceCode: 'Initial', interfaceText: 'Initial' },
              checkoutTransactionItemId: getCheckoutTransactionItemIdFromContext(),
            }),
        getClientToken({ merchantAccountId, customerId: braintreeCustomerId }),
      ]);

      const ctPayment = reusedPayment ?? newPayment;
      if (!ctPayment || !clientToken)
        throw new ErrorInvalidOperation(
          `Payment or token resolution failed, payment id ${ctPayment?.id}, cart id: ${ctCart.id}`,
        );

      await Promise.all([
        newPayment && !isPureVault // PURE_VAULT_DISABLED: unreachable
          ? this.ctCartService.addPayment({
              resource: { id: ctCart.id, version: ctCart.version },
              paymentId: newPayment.id,
            }) //it is not possible to add the payment to empty cart via checkout API, but for the pure vault all relevant data will be saved on customer anyway
          : Promise.resolve(),
        !tokenRecentlyUpdated
          ? this.ctPaymentService.updatePayment({
              id: ctPayment.id,
              customFields: handleCustomFieldResponse('getClientToken', clientToken),

              pspInteractions: [
                handleInterfaceInteraction({
                  messageName: 'getClientToken',
                  message: { merchantAccountId, isPureVault, builderType, paymentMethodType }, // PURE_VAULT_DISABLED: unreachable
                  messageType: 'ProcessorRequest',
                }),
                handleInterfaceInteraction({
                  messageName: 'getClientToken',
                  message: clientToken,
                  messageType: 'Response',
                }),
              ],
            })
          : Promise.resolve(),
      ]);

      logger.info(`createPayment: success, cartId: ${cartId}`);
      return this.buildCreatePaymentResponse(
        ctPayment,
        clientToken,
        ctCart,
        isExpress,
        isPureVault,
        customer ?? undefined,
        shippingMethods,
        braintreeCustomerId,
      );
    } catch (err) {
      logger.error(`createPayment: failed, cartId: ${cartId ?? 'unavailable'} — ${errorMessage(err)}`);
      throw err;
    }
  }

  private existingPaymentAndToken(
    existingPayment: Payment | undefined,
    amountPlanned: { centAmount: number; currencyCode: string },
  ): { payment: Payment | undefined; tokenRecentlyUpdated: boolean } {
    if (!existingPayment) return { payment: undefined, tokenRecentlyUpdated: false };

    const isAmountMismatch =
      existingPayment.amountPlanned.centAmount !== amountPlanned.centAmount ||
      existingPayment.amountPlanned.currencyCode !== amountPlanned.currencyCode;

    if (isAmountMismatch || existingPayment.transactions.length > 0) {
      return { payment: undefined, tokenRecentlyUpdated: false };
    }

    const tokenRecentlyUpdated = existingPayment.interfaceInteractions.some(
      (i) =>
        i.fields?.type === 'getClientTokenResponse' &&
        Date.now() - new Date(i.fields.timestamp as string).getTime() < 2 * 60 * 1000,
    );

    return { payment: existingPayment, tokenRecentlyUpdated };
  }

  private buildCreatePaymentResponse(
    ctPayment: Payment,
    clientToken: string,
    ctCart: Cart,
    isExpress: boolean,
    isPureVault: boolean,
    customer: Customer | undefined,
    shippingMethods: ShippingMethod[],
    braintreeCustomerId: string | undefined,
  ): PaymentResponseSchemaDTO {
    const extendedLineItems = isPureVault
      ? []
      : ctCart.lineItems.map((lineItem) => mapCTLineItemToBraintreeLineItem(lineItem, ctCart.locale));
    if (!isPureVault) {
      if (ctCart.discountOnTotalPrice?.discountedAmount) {
        const amount = mapCommercetoolsMoneyToBraintreeMoney(ctCart.discountOnTotalPrice.discountedAmount);
        extendedLineItems.push({
          name: 'Discount',
          kind: 'credit' as LineItemKind,
          unitAmount: amount,
          totalAmount: amount,
          productCode: 'DISCOUNT',
          ...lineItemPlaceholders,
        });
      }
      if (!isExpress && ctCart.shippingInfo) {
        const amount = mapCommercetoolsMoneyToBraintreeMoney(ctCart.shippingInfo.price);
        extendedLineItems.push({
          name: ctCart.shippingInfo.shippingMethodName || 'Shipping',
          kind: 'debit' as LineItemKind,
          unitAmount: amount,
          totalAmount: amount,
          productCode: 'SHIPPING',
          ...lineItemPlaceholders,
        });
      }
    }
    return {
      braintreeData: { clientToken, braintreeCustomerId },
      payment: {
        firstName: ctCart.billingAddress?.firstName,
        lastName: ctCart.billingAddress?.lastName,
        ctPaymentId: ctPayment.id,
        currency: ctPayment.amountPlanned.currencyCode,
        braintreeAmount: toNum(ctPayment.amountPlanned),
        email: ctCart.customerEmail,
        shippingOptions: isExpress
          ? mapShippingMethodsToBraintreeShippingOptions(
              shippingMethods,
              ctPayment.amountPlanned.currencyCode,
              ctCart.shippingInfo?.shippingMethod?.id,
            )
          : undefined,
        braintreeLineItems: extendedLineItems,
        braintreeShipping: ctCart.shippingAddress
          ? mapCTShippingToBraintreeShipping(ctCart.shippingAddress)
          : undefined,
        ctCustomerId: customer?.id,
        ctCustomerVersion: customer?.version,
        countryCode: ctCart.billingAddress?.country || ctCart.country,
        fallbackUrl: getConfig().localPaymentFallbackUrl || undefined,
      },
    };
  }

  public async updateCartShipping({
    newShippingMethodId,
    address,
  }: UpdateCartShippingRequestSchemaDTO): Promise<UpdateCartShippingResponseSchemaDTO> {
    const cartId = getCartIdFromContext();
    try {
      const ctCart = await this.ctCartService.getCart({
        id: cartId,
      });
      const setShippingAddressAction: CartSetShippingAddressAction | undefined = address
        ? { action: 'setShippingAddress', address }
        : undefined;
      const setShippingMethodAction: CartSetShippingMethodAction = {
        action: 'setShippingMethod',
        shippingMethod: {
          id: newShippingMethodId,
          typeId: 'shipping-method',
        },
      };
      const updatedCard = await paymentSDK.ctAPI.client
        .carts()
        .withId({ ID: ctCart.id })
        .post({
          body: {
            version: ctCart.version,
            actions: setShippingAddressAction
              ? [setShippingAddressAction, setShippingMethodAction]
              : [setShippingMethodAction],
          },
        })
        .execute()
        .then((response) => response.body)
        .catch((err) => {
          log.warn(`Could not set shipping method ${newShippingMethodId} for cart ${ctCart.id}`, { error: err });
          return;
        });
      if (!updatedCard) {
        throw new ErrorInvalidOperation(
          `Could not set shipping method ${newShippingMethodId} for cart ${ctCart.id}. Cart not found in CoCo.`,
        );
      }
      const costWithNewShipping = await this.ctCartService.getPaymentAmount({ cart: updatedCard }); //as checkout api doesn't support updatePayment amountPlanned - it is postponed to transaction sale in order to speed up the response
      const totalNum = toNum(costWithNewShipping as CentPrecisionMoney);
      const shippingNum = toNum(updatedCard.shippingInfo?.price);
      const discountNum = toNum(updatedCard.discountOnTotalPrice?.discountedAmount);
      // taxTotal must be mapped separately only for external tax modes (External / ExternalAmount);
      // for Platform/Disabled the tax is already embedded in line item prices.
      const isExternalTax = updatedCard.taxMode === 'External' || updatedCard.taxMode === 'ExternalAmount';
      const taxNum = isExternalTax ? toNum(updatedCard.taxedPrice?.totalTax) : 0;

      // amountBreakdown must satisfy PayPal's validation:
      // itemTotal + taxTotal + shipping + handling + insurance - discount - shippingDiscount = amount
      // itemTotal is derived from braintreeAmount rather than summed from line items to avoid rounding drift.
      const itemTotal = (totalNum - shippingNum + discountNum - taxNum).toFixed(2);

      logger.info(`updateCartShipping: success, cartId: ${ctCart.id}`);
      return {
        braintreeAmount: totalNum.toFixed(2),
        amountBreakdown: {
          itemTotal,
          taxTotal: taxNum.toFixed(2),
          shipping: shippingNum.toFixed(2),
          discount: discountNum.toFixed(2),
          handling: '0.00',
          insurance: '0.00',
          shippingDiscount: '0.00',
        },
      };
    } catch (err) {
      logger.error(`updateCartShipping: failed, cartId: ${cartId ?? 'unavailable'} — ${errorMessage(err)}`);
      throw err;
    }
  }

  public async transactionSale({
    ctPaymentId,
    braintreeCustomerId,
    paymentMethodNonce,
    paymentToken,
    storeInVaultOnSuccess,
    storeShipping,
    deviceData,
    braintreePaymentDetails,
    paymentMethodType,
    localPaymentId,
    venmoUsername,
    paypalOrderId,
    achMandateText,
    achMandateAcceptedAt,
  }: TransactionSaleRequestSchemaDTO): Promise<PaymentUpdateResponseSchemaDTO> {
    this.validateTransactionSaleParams(
      paymentMethodType,
      paymentMethodNonce,
      paymentToken,
      localPaymentId,
      venmoUsername,
    );
    const [updatedCart, ctPayment] = await Promise.all([
      braintreePaymentDetails?.extraShippingCost
        ? this.ctCartService.getCart({
            id: getCartIdFromContext(),
          })
        : Promise.resolve(undefined),
      await this.ctPaymentService.getPayment({ id: ctPaymentId }),
    ]);
    if (!ctPayment) {
      throw new ErrorInvalidOperation(`payment is missing for transactionSale payment ${ctPaymentId}}`);
    }
    // Unverified ACH payment whose Order was cancelled before the micro-deposits were verified (cancelPlaceholderPayment)
    if (hasCancelledPlaceholder(ctPayment)) {
      throw new ErrorInvalidOperation(
        `transactionSale refused — payment ${ctPaymentId} was cancelled before verification`,
      );
    }
    if (!updatedCart && braintreePaymentDetails?.extraShippingCost)
      throw new ErrorInvalidOperation(`could not find updated cart for transactionsSale payment ${ctPaymentId}`);
    const relevantPaymentInfo = updatedCart ? { ...ctPayment, amountPlanned: updatedCart.totalPrice } : ctPayment;
    const isPayPal = paymentMethodType === 'PayPal'; // PAYPAL_STORED_DISABLED: || paymentMethodType === 'PayPalStored'
    const lineItems = (braintreePaymentDetails?.braintreeLineItems ?? [])
      // Braintree has 35-char limit for line item names — see https://developers.braintreepayments.com/reference/request/transaction/sale/node#line_items-name
      .map((item) => ({ ...item, name: item.name.substring(0, 35) }))
      // Braintree rejects zero-amount line items for non-PayPal methods; for PayPal, zero amounts are explicitly allowed
      .filter(({ productCode, unitAmount }) => productCode !== 'DISCOUNT' && (isPayPal || Number(unitAmount) > 0));
    // discountAmount is derived as the residual needed to balance lineItems (+ shipping, when submitted
    // separately) against the actual charged amount, rather than read from a separately fetched/echoed
    // discount value — this keeps it correct regardless of cart discount type, staleness, or rounding.
    const shippingAmountNum = braintreePaymentDetails?.extraShippingCost
      ? Number(braintreePaymentDetails.extraShippingCost)
      : 0;
    const lineItemsTotal = lineItems.reduce((sum, { totalAmount }) => sum + Number(totalAmount), 0);
    const discountResidual = lineItemsTotal + shippingAmountNum - toNum(relevantPaymentInfo.amountPlanned);
    if (discountResidual < -0.01) {
      log.warn(
        `transactionSale: lineItems total (${lineItemsTotal.toFixed(2)}) plus shipping (${shippingAmountNum.toFixed(2)}) is less than the charged amount (${toNum(relevantPaymentInfo.amountPlanned).toFixed(2)}) for payment ${ctPaymentId} — discountAmount clamped to 0, check for missing external tax/fees`,
      );
    }
    const discountAmount = Math.max(0, discountResidual).toFixed(relevantPaymentInfo.amountPlanned.fractionDigits);
    // braintreeCustomerId can be missing because the CT custom field was wiped (frequently occurring redeploy issue),
    // not because the customer is new. Check for a pre-existing Braintree customer
    // (ids are equal to the CT customer id by construction) before embedding an inline "create customer"
    // payload — otherwise Braintree rejects the whole sale with "Customer ID has already been taken"
    // when that customer already exists.
    let existingBtCustomerId: string | undefined;
    if (storeInVaultOnSuccess && ctPayment.customer?.id && !braintreeCustomerId) {
      existingBtCustomerId = await this.braintreeCustomerService.findExistingBraintreeCustomerId(ctPayment.customer.id);
    }
    const optionalRequestData: Partial<TransactionRequest> = {
      ...(storeInVaultOnSuccess && ctPayment.customer?.id && !braintreeCustomerId
        ? existingBtCustomerId
          ? { customerId: existingBtCustomerId } // attach to the pre-existing Braintree customer instead of re-creating it
          : { customer: { id: ctPayment.customer.id } }
        : {}),
      lineItems,
      discountAmount,
      ...(braintreePaymentDetails?.extraShippingCost
        ? {
            shippingAmount: shippingAmountNum.toFixed(ctPayment.amountPlanned.fractionDigits),
          } //will be only submitted in express mode, then shipping was submitted via SDK through update and can be mapped here, otherwise it is included in line items
        : {}), //see enabler PayPalMask onShippingChange and onApprove
      ...(deviceData ? { deviceData } : {}),
      ...(braintreePaymentDetails?.braintreeShipping ? { shipping: braintreePaymentDetails.braintreeShipping } : {}),
      ...(achMandateText
        ? { usBankAccount: { achMandateText, achMandateAcceptedAt: achMandateAcceptedAt ?? new Date().toISOString() } }
        : {}),
    };
    const transactionRequest = mapRequestToBraintreeTransactionSale(
      relevantPaymentInfo,
      storeInVaultOnSuccess,
      storeShipping,
      paymentMethodNonce,
      paymentToken,
      optionalRequestData,
    );
    // options.submitForSettlement is required to be true for ACH and local payment methods
    if (localPaymentId || paymentMethodType === PaymentMethodType.ACH || getConfig().autoCapture) {
      transactionRequest.options!.submitForSettlement = true;
    }
    let response!: Transaction;
    try {
      response = await transactionSale(transactionRequest);
    } catch (e) {
      logger.error(`transactionSale: Braintree call failed, paymentId: ${ctPaymentId} — ${errorMessage(e)}`);
      throw new ErrorInvalidOperation(
        `transactionSale failed for payment ${ctPaymentId} with error ${errorMessage(e)}`,
      );
    }
    warnOnFieldMismatch(ctPaymentId, [
      {
        fieldName: 'localPaymentId',
        enablerValue: localPaymentId,
        braintreeValue: (response as TransactionWithLocalPayment).localPayment?.paymentId,
      },
      { fieldName: 'venmoUsername', enablerValue: venmoUsername, braintreeValue: response.venmoAccount?.username },
    ]);
    const customFields = handleCustomFieldResponse('transactionSale', response);
    handleCustomTransactionFields(customFields, response, ctPayment);
    // Fire-and-forget: customer update has no webhook fallback, so retries are handled
    // internally in linkBraintreeCustomerId, but it does not block the transaction response.
    if (storeInVaultOnSuccess && response.customer?.id && ctPayment.customer?.id) {
      void this.braintreeCustomerService.linkBraintreeCustomerId(ctPayment.customer.id, response.customer.id);
      // Symmetric with linkBraintreeCustomerId above: also register the vaulted method in commercetools'
      // own PaymentMethod resource. Best-effort — Braintree's vault above already succeeded and remains
      // authoritative regardless of whether this succeeds; see the class-level note in abstract-payment.service.ts.
      const vaultedToken = response.creditCard?.token ?? response.paypalAccount?.token;
      if (vaultedToken) {
        this.fireAndForgetCtPaymentMethodSync(
          () =>
            this.ctPaymentMethodService.save({
              customerId: ctPayment.customer!.id,
              method: paymentMethodType,
              paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
              token: vaultedToken,
            }),
          `transactionSale: could not save commercetools PaymentMethod record for payment ${ctPaymentId}`,
        );
      }
    }
    // CT sync — Braintree already processed. Awaited so the Authorization transaction (which triggers
    // commercetools Checkout's Order creation) is written before the response; retryCTSync never throws,
    // so a CT failure still returns the Braintree result. Local payments have a notifications fallback
    // (local_payment_completed webhook, see notifications.controller.ts → handleLocalPaymentCompleted), so 1 attempt
    // is sufficient; non-local methods get full retry with backoff, no notifications fallback
    const ctSyncFn = () =>
      this.updatePaymentWithTransaction({
        messageName: 'transactionSale',
        request: transactionRequest,
        ctPayment,
        response,
        customFields,
        // CT Checkout creates the order when it sees an Authorization type transaction on the payment.
        // The Adyen reference connector hardcodes this for the same reason.
        // settlement/refundPayment/void call updatePaymentWithTransaction without this override
        // and correctly produce Charge/Refund/CancelAuthorization types respectively.
        transactionTypeOverride: 'Authorization',
      });
    await retryCTSync(
      ctSyncFn,
      'transactionSale',
      ctPaymentId,
      formatBraintreeSyncContext(response, [paypalOrderId && `paypalOrderId: ${paypalOrderId}`]),
      // Local payments have a webhook fallback (local_payment_completed → handleLocalPaymentCompleted
      // in braintree-notifications), so 1 attempt is sufficient — the webhook handles recovery if
      // CT sync fails here. Non-local payments have no fallback, so full retries apply.
      localPaymentId ? 1 : undefined,
    );
    if (response.paymentInstrumentType === 'venmo_account' && !venmoUsername) {
      log.warn(`transactionSale: Venmo username missing in request for payment ${ctPayment.id}`);
    }
    logger.info(`transactionSale: success, paymentId: ${ctPaymentId}`);
    return this.paymentActionSuccessResponse(ctPayment.id, undefined, venmoUsername);
  }

  //see also extension module submitForSettlement
  public async settlement(request: ModifyPaymentWithTransactionRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment, amount } = request;
    const targetTransactions = ctPayment.transactions.filter(
      ({ type, interactionId }) => type === 'Authorization' && !isPlaceholderInteractionId(interactionId),
    );
    if (!targetTransactions.length)
      return this.rejectPaymentIntent(ctPayment.id, 'settlement', 'no transaction with a type suitable for settlement');
    const relevantTransaction = targetTransactions[targetTransactions.length - 1];
    if (!relevantTransaction.interactionId)
      return this.rejectPaymentIntent(ctPayment.id, 'settlement', 'Authorization has no interactionId');
    const braintreeAmount = mapCommercetoolsMoneyToBraintreeMoney({ ...ctPayment.amountPlanned, ...amount });
    let response!: Transaction;
    try {
      response = await submitForSettlement(relevantTransaction.interactionId, braintreeAmount);
    } catch (err) {
      logger.error(`settlement: Braintree call failed, paymentId: ${ctPayment.id} — ${errorMessage(err)}`);
      throw new ErrorGeneral(`settlement failed for payment ${ctPayment.id} with error ${errorMessage(err)}`);
    }
    // CT sync — Braintree already settled; awaited (retryCTSync never throws), no notifications fallback
    await retryCTSync(
      () =>
        this.updatePaymentWithTransaction({
          messageName: 'submitForSettlement',
          request: request,
          ctPayment,
          response,
        }),
      'settlement',
      ctPayment.id,
      formatBraintreeSyncContext(response),
    );
    logger.info(`settlement: success, paymentId: ${ctPayment.id}`);
    return this.toPaymentIntentResponse(response);
  }

  /**
   * Refund payment
   *
   * @remarks
   * Refund braintree payment including partial refund and refund specific transaction
   *
   * @param request - contains payment id (required), optional refund amount (braintree money) and optional transaction id.
   * If amount is provided - refund will be attempted with this amount.
   * If transaction id is provided - refund will be attempted for this transaction
   * @returns PaymentIntentResponseSchemaDTO
   */
  async refundPayment(request: ModifyPaymentWithTransactionRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment, amount } = request;
    const relevantTransactionId = request.transactionId || findTransactionIdOrUndefined(ctPayment, 'Charge');
    if (!relevantTransactionId) {
      return this.rejectPaymentIntent(ctPayment.id, 'refundPayment', 'no transaction suitable for refund');
    }
    const braintreeAmount = mapCommercetoolsMoneyToBraintreeMoney({ ...ctPayment.amountPlanned, ...amount });
    let response!: Transaction;
    try {
      response = await braintreeRefund(relevantTransactionId, braintreeAmount);
    } catch (err) {
      logger.error(`refundPayment: Braintree call failed, paymentId: ${ctPayment.id} — ${errorMessage(err)}`);
      throw new ErrorGeneral(`refundPayment failed for payment ${ctPayment.id} with error ${errorMessage(err)}`);
    }
    // CT sync — Braintree already refunded; awaited (retryCTSync never throws), no notifications fallback
    const customFields = handleCustomFieldResponse('refund', response);
    await retryCTSync(
      () =>
        this.updatePaymentWithTransaction({
          messageName: 'refund',
          request: { relevantTransactionId, amount },
          ctPayment,
          response,
          customFields,
        }),
      'refundPayment',
      ctPayment.id,
      formatBraintreeSyncContext(response),
    );
    logger.info(`refundPayment: success, paymentId: ${ctPayment.id}`);
    return this.toPaymentIntentResponse(response);
  }

  async void(request: CancelPaymentRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment } = request;
    const transactionId = findTransactionIdOrUndefined(ctPayment, 'Authorization');
    if (!transactionId) {
      if (ctPayment.transactions.some((t) => isPlaceholderInteractionId(t.interactionId))) {
        return this.cancelPlaceholderPayment(ctPayment);
      }
      return this.rejectPaymentIntent(ctPayment.id, 'void', 'no Braintree transaction suitable for void');
    }
    return this.voidTransaction(ctPayment, transactionId);
  }

  /**
   * Voids one specific Braintree transaction — the payment's Authorization (void) or, from reverseUncapturedPayment,
   * a still-voidable partial-settlement child (the Charge's interactionId).
   */
  private async voidTransaction(ctPayment: Payment, transactionId: string): Promise<PaymentIntentResponseSchemaDTO> {
    const transaction = ctPayment.transactions.find(
      (transaction) => transaction.interactionId === transactionId && transaction.type === 'Authorization',
    );
    let response!: Transaction;
    try {
      if (transaction?.state === 'Initial') {
        await braintreeDeletePayment(transactionId);
        response = {
          amount: mapCommercetoolsMoneyToBraintreeMoney(transaction.amount),
          status: 'voided',
          id: transactionId,
          updatedAt: getCurrentTimestamp(),
        } as Transaction; //other required by type definition fields are not used in communication with commercetools
      } else response = await braintreeVoidTransaction(transactionId);
    } catch (err) {
      logger.error(`void: Braintree call failed, paymentId: ${ctPayment.id} — ${errorMessage(err)}`);
      throw new ErrorGeneral(`void failed for payment ${ctPayment.id} with error ${errorMessage(err)}`);
    }
    // CT sync — Braintree already voided; awaited (retryCTSync never throws), no notifications fallback
    const customFields = handleCustomFieldResponse('void', response);
    await retryCTSync(
      () =>
        this.updatePaymentWithTransaction({
          messageName: 'void',
          request: { transactionId },
          ctPayment,
          response,
          customFields,
        }),
      'void',
      ctPayment.id,
      formatBraintreeSyncContext(response),
    );
    logger.info(`void: success, paymentId: ${ctPayment.id}`);
    return this.toPaymentIntentResponse(response);
  }

  /**
   * Cancel of an unverified ACH payment (micro-deposit flow) — only the Pending placeholder exists, and Braintree has
   * no transaction yet (just the vaulted bank account), so there is nothing to void there. Marks the cancellation on
   * commercetools with a CancelAuthorization/Success carrying the placeholder marker (commercetools connect template's
   * cancel shape); transactionSale refuses such a payment afterwards (hasCancelledPlaceholder), so the Order can't be
   * charged once the micro-deposits are verified.
   */
  private async cancelPlaceholderPayment(ctPayment: Payment): Promise<PaymentIntentResponseSchemaDTO> {
    await retryCTSync(
      async () => {
        const payment = await this.ctPaymentService.getPayment({ id: ctPayment.id });
        if (hasCancelledPlaceholder(payment)) return;
        const placeholder = payment.transactions.find((t) => isPlaceholderInteractionId(t.interactionId));
        const amount = placeholder?.amount ?? payment.amountPlanned;
        await paymentSDK.ctAPI.client
          .payments()
          .withId({ ID: ctPayment.id })
          .post({
            body: {
              version: payment.version,
              actions: [
                {
                  action: 'addTransaction',
                  transaction: {
                    type: 'CancelAuthorization',
                    state: 'Success',
                    interactionId: buildPlaceholderInteractionId(ctPayment.id),
                    amount: { centAmount: amount.centAmount, currencyCode: amount.currencyCode },
                  },
                },
              ],
            },
          })
          .execute();
      },
      'cancelPlaceholderPayment',
      ctPayment.id,
      '', // no Braintree transaction behind a placeholder
    );
    logger.warn(
      `void: ACH payment cancelled before micro-deposit verification, no Braintree transaction exists — the bank account stays vaulted, paymentId: ${ctPayment.id}. Cancelled commercetools transaction placeholder added to avoid accidental Braintree capture in the future.`,
    );
    return { outcome: PaymentModificationStatus.APPROVED };
  }

  /**
   * Reverse payment — refund what has been captured, void what hasn't (commercetools' reversePayment semantics,
   * docs.commercetools.com/checkout/payment-intents-api). Primary gate is the commercetools capture: free (payment
   * already fetched), and a capture seen on commercetools is definitely on Braintree too. Only without one is
   * Braintree asked (see reverseUncapturedPayment).
   */
  async reversePayment(request: CancelPaymentRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment } = request;
    let capturedBalance: ReturnType<typeof findCapturedChargeBalance>;
    try {
      capturedBalance = findCapturedChargeBalance(ctPayment);
    } catch (err) {
      return this.rejectPaymentIntent(ctPayment.id, 'reversePayment', errorMessage(err));
    }
    if (!capturedBalance) return this.reverseUncapturedPayment(ctPayment);
    if (capturedBalance.remainingAmount <= 0) {
      return this.rejectPaymentIntent(ctPayment.id, 'reversePayment', 'already fully refunded');
    }
    return await this.refundPayment({
      payment: ctPayment,
      // Braintree transaction id (interactionId), not the CT transaction id — refundPayment passes
      // transactionId straight to Braintree.
      transactionId: capturedBalance.transaction.interactionId,
      amount: { ...capturedBalance.transaction.amount, centAmount: capturedBalance.remainingAmount },
    });
  }

  /**
   * reversePayment fallback — only reached when commercetools shows no captured Charge.
   * The Charge's interactionId is asked about first: settlement always passes an amount, so Braintree captures via
   * submitForPartialSettlement into a *child* transaction with its own id (the CT Charge carries the child, the
   * Authorization the parent), and that Charge stays Pending until the settlement webhook arrives — so this is the
   * normal route right after a capture. Only without a Charge is the Authorization (parent) used.
   * Braintree's live status of that transaction decides: already settled/settling (e.g. the settlement's CT sync
   * failed, or the Charge is still Pending on commercetools) → refund the remaining balance; still voidable → void it
   * (the child only — the parent's leftover authorization expires on its own).
   */
  private async reverseUncapturedPayment(ctPayment: Payment): Promise<PaymentIntentResponseSchemaDTO> {
    const transactionId =
      findTransactionIdOrUndefined(ctPayment, 'Charge') ?? findTransactionIdOrUndefined(ctPayment, 'Authorization');
    if (!transactionId) {
      if (ctPayment.transactions.some((t) => isPlaceholderInteractionId(t.interactionId))) {
        return this.cancelPlaceholderPayment(ctPayment);
      }
      return this.rejectPaymentIntent(ctPayment.id, 'reversePayment', 'no transaction suitable for reverse');
    }
    let braintreeTransaction!: Transaction;
    try {
      braintreeTransaction = await braintreeGetTransaction(transactionId);
    } catch (err) {
      logger.error(`reversePayment: Braintree call failed, paymentId: ${ctPayment.id} — ${errorMessage(err)}`);
      throw new ErrorGeneral(`reversePayment failed for payment ${ctPayment.id} with error ${errorMessage(err)}`);
    }
    const { status } = braintreeTransaction;
    if (status === 'settling' || status === 'settled' || status === 'settlement_confirmed') {
      const remainingAmount = remainingRefundableCentAmount(
        ctPayment,
        mapBraintreeMoneyToCommercetoolsMoney(braintreeTransaction.amount, ctPayment.amountPlanned.fractionDigits),
      );
      if (remainingAmount <= 0) {
        return this.rejectPaymentIntent(ctPayment.id, 'reversePayment', 'already fully refunded');
      }
      return await this.refundPayment({
        payment: ctPayment,
        transactionId,
        amount: { centAmount: remainingAmount, currencyCode: ctPayment.amountPlanned.currencyCode },
      });
    }
    if (status === 'authorized' || status === 'submitted_for_settlement' || status === 'settlement_pending') {
      return await this.voidTransaction(ctPayment, transactionId);
    }
    return this.rejectPaymentIntent(
      ctPayment.id,
      'reversePayment',
      `Braintree transaction status ${status} can't be reversed`,
    );
  }

  //this method corresponds to handleStoredPaymentMethod part for create a new stored method
  /* PURE_VAULT_DISABLED start — pure vault cancelled; uncomment to re-enable
  public async pureVault({
    ctCustomerId,
    ctPaymentId,
    ctCustomerVersion,
    braintreeCustomerId,
    paymentMethodNonce,
    //braintree CustomerCreateRequest data (includes nonce) or braintree  PaymentMethodCreateRequest
  }: PureVaultRequestSchemaDTO): Promise<PaymentUpdateResponseSchemaDTO> {
    if (!ctCustomerId) {
      throw new ErrorRequiredField('customerId', {
        privateMessage: 'The customerId is not set on the cart yet the customer wants to tokenize the payment',
        privateFields: {
          cart: {
            id: ctPaymentId,
            typeId: 'payment',
          },
        },
      });
    }
    if (!ctCustomerVersion || !paymentMethodNonce)
      throw new ErrorRequiredField(paymentMethodNonce ? 'version' : 'nonce', {
        privateMessage: 'Version or nonce is missing for payment and customer',
        privateFields: {
          cart: {
            id: ctPaymentId,
            typeId: 'payment',
          },
          customer: {
            id: ctCustomerId,
            typeId: 'customer',
          },
        },
      });
    logger.info(`triggering vault, ${braintreeCustomerId}`);
    return await this.braintreeCustomerService.pureVault({
      ctCustomerId,
      ctCustomerVersion,
      braintreeCustomerId,
      paymentMethodNonce,
    });
  }
  PURE_VAULT_DISABLED end */

  /**
   * Vaults an ACH (US Bank Account) nonce and returns the vault token with its verification status.
   *
   * ACH has two verification paths:
   *
   * A. Instant (bank login / Plaid): verified=true on return. The enabler calls transactionSale
   *    immediately with the vault token. Braintree returns settlement_pending; CT is synced to
   *    Pending via retryCTSync in transactionSale.
   *
   * B. Micro-deposit: verified=false. The bank account is vaulted but verification takes 1–5
   *    business days. CT payment is synced to Pending here (awaited, before responding) so the merchant's
   *    order management reflects the intent. The enabler redirects to the result page immediately using the
   *    returned merchantReturnUrl.
   *    MERCHANT RESPONSIBILITY: when the customer completes micro-deposit verification, Braintree
   *    sends a webhook. The merchant must listen for it and call transactionSale with the stored
   *    vault token to complete the payment. This connector does not handle that step automatically.
   */
  public async getAchVaultToken({
    paymentMethodNonce,
    ctPaymentId,
    braintreeCustomerId,
    ctCustomerId,
  }: AchVaultTokenRequestSchemaDTO): Promise<AchVaultTokenResponseSchemaDTO> {
    const { token, verified } = await this.braintreeCustomerService.vaultPaymentMethodForCustomer({
      paymentMethodNonce,
      braintreeCustomerId,
      ctCustomerId,
    });

    // Symmetric with linkBraintreeCustomerId (called inside vaultPaymentMethodForCustomer): also register
    // the vaulted method in commercetools' own PaymentMethod resource. Best-effort — Braintree's vault
    // above already succeeded and remains authoritative; see the class-level note in abstract-payment.service.ts.
    // ctPaymentMethodService requires the CT customer id, which may not be the request body's optional
    // ctCustomerId (that field can be omitted when the caller only supplied an existing braintreeCustomerId),
    // so it's resolved from cart context instead, same as getStoredPaymentMethods/deleteStoredPaymentMethod.
    // Fire-and-forget end-to-end so the cart lookup doesn't add latency to the vault-token response.
    this.fireAndForgetCtPaymentMethodSync(
      () =>
        this.ctCartService.getCart({ id: getCartIdFromContext() }).then((ctCartForVault) => {
          if (!ctCartForVault.customerId) return;
          return this.ctPaymentMethodService.save({
            customerId: ctCartForVault.customerId,
            method: PaymentMethodType.ACH,
            paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
            token,
          });
        }),
      `getAchVaultToken: could not save commercetools PaymentMethod record for payment ${ctPaymentId}`,
    );

    if (!verified) {
      // Awaited — this placeholder is the write that triggers commercetools Checkout's Order creation, so it must
      // exist before the settlement_pending redirect goes out (retryCTSync never throws).
      await retryCTSync(
        () =>
          this.syncCtPaymentStatus({
            ctPaymentId,
            // interfaceText follows the project convention: short Braintree status string
            // (same as response.status used in updatePaymentWithTransaction and
            // common-connect/src/utils/response.utils.ts)
            interfaceCode: 'settlement_pending',
            interfaceText: 'settlement_pending',
            method: 'us_bank_account',
            // Pending, never Initial — same shape as the PayPal connector's placeholder; commercetools
            // Checkout triggers Order creation from a non-Initial transaction.
            ensureTransaction: { type: 'Authorization', state: 'Pending' },
          }),
        'getAchVaultToken:pendingSync',
        ctPaymentId,
        'settlement_pending',
      );
    }

    return {
      token,
      verified,
      merchantReturnUrl: verified ? undefined : this.buildRedirectMerchantUrl(ctPaymentId, 'settlement_pending'),
    };
  }

  public async getStoredPaymentMethods(): Promise<StoredPaymentMethodsResponse> {
    const ctCart = await this.ctCartService.getCart({ id: getCartIdFromContext() });
    if (!ctCart.customerId) {
      logger.warn('getStoredPaymentMethods: cart has no customerId, returning empty');
      return { storedPaymentMethods: [] };
    }
    const ctCustomer = await this.braintreeCustomerService.getCtCustomer(ctCart.customerId);
    const braintreeCustomerId = ctCustomer?.custom?.fields?.braintreeCustomerId;
    if (!braintreeCustomerId) {
      logger.warn(
        `getStoredPaymentMethods: CT customer ${ctCart.customerId} has no braintreeCustomerId, returning empty`,
      );
      return { storedPaymentMethods: [] };
    }
    const gateway = await getBraintreeGateway();
    try {
      const btCustomer = await gateway.customer.find(braintreeCustomerId);
      // commercetools Checkout's own UI only supports displaying/reusing stored credit cards —
      // PayPal and ACH bank accounts remain vaulted in Braintree but are not surfaced as stored
      // payment methods here. Please open an issue if you are interested.
      const creditCards = (btCustomer.creditCards ?? []).map(mapBraintreeCreditCardToStoredPaymentMethod);
      // const paypalAccounts = (btCustomer.paypalAccounts ?? []).map(mapBraintreePaypalAccountToStoredPaymentMethod);
      // `btCustomer` is cast to `any` because @types/braintree does not declare `usBankAccounts`
      // on the Customer type, even though the SDK populates it at runtime.
      // const usBankAccounts = ((btCustomer as any).usBankAccounts ?? []).map(
      //   mapBraintreeUsBankAccountToStoredPaymentMethod,
      // );
      logger.info(`getStoredPaymentMethods: customer ${braintreeCustomerId} — creditCards: ${creditCards.length}`);
      if (!creditCards.length) {
        logger.warn(`No stored payment methods returned by Braintree for customer ${braintreeCustomerId}`);
      }
      // This connector vaulted directly against Braintree before
      // commercetools-native PaymentMethod tracking existed, so older stored methods may have no CT
      // counterpart. Only credit cards are compared due to current checkout limitations.
      // Fire-and-forget: this is a diagnostic-only cross-check, not needed to answer the request.
      const customerId = ctCart.customerId;
      this.fireAndForgetCtPaymentMethodSync(
        () =>
          this.ctPaymentMethodService
            .find({
              customerId,
              paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
            })
            .then((ctPaymentMethods) => {
              const ctCreditCardCount = ctPaymentMethods.results.filter(
                (pm) => pm.method === PaymentMethodType.CREDIT_CARD,
              ).length;
              if (ctCreditCardCount !== creditCards.length) {
                logger.warn(
                  `getStoredPaymentMethods: Braintree/commercetools credit card counts differ for customer ${braintreeCustomerId} — Braintree: ${creditCards.length}, commercetools: ${ctCreditCardCount}`,
                );
              }
            }),
        'getStoredPaymentMethods: could not cross-check against commercetools PaymentMethod records',
      );
      return { storedPaymentMethods: [...creditCards] };
    } catch (e) {
      logger.warn(`Could not find Braintree customer ${braintreeCustomerId}: ${errorMessage(e)}`);
      return { storedPaymentMethods: [] };
    }
  }

  public async deleteStoredPaymentMethod(token: string): Promise<void> {
    const cartId = getCartIdFromContext();
    let ctCart: Cart | undefined;
    try {
      [, ctCart] = await Promise.all([
        braintreeDeletePayment(token),
        this.ctCartService.getCart({ id: cartId }).catch(() => undefined),
      ]);
      logger.info(`deleteStoredPaymentMethod: success, cartId: ${ctCart?.id ?? 'unavailable'}`);
    } catch (err) {
      logger.error(`deleteStoredPaymentMethod: failed, cartId: ${cartId ?? 'unavailable'} — ${errorMessage(err)}`);
      throw err;
    }

    // Symmetric with save(): also remove the mirrored commercetools-native PaymentMethod record, if one
    // exists. Braintree deletion above already succeeded and is the authoritative action; this is a
    // best-effort mirror cleanup only — fire-and-forget so it doesn't add latency to the response.
    // Expected to find nothing for methods vaulted before commercetools-native PaymentMethod tracking existed.
    if (ctCart?.customerId) {
      const customerId = ctCart.customerId;
      this.fireAndForgetCtPaymentMethodSync(
        () =>
          this.ctPaymentMethodService
            .getByTokenValue({
              customerId,
              tokenValue: token,
              paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
            })
            .then((ctPaymentMethod) =>
              this.ctPaymentMethodService.delete({
                customerId,
                id: ctPaymentMethod.id,
                version: ctPaymentMethod.version,
              }),
            ),
        'deleteStoredPaymentMethod: no matching commercetools PaymentMethod record',
      );
    }
  }

  /**
   * Runs a commercetools PaymentMethod sync operation (save/find/delete against
   * ctPaymentMethodService) without blocking the caller. Braintree is always the authoritative
   * action and has already completed by the time this is called; a failure here is logged and
   * swallowed rather than surfaced, since this mirror is best-effort — see the class-level note
   * in abstract-payment.service.ts.
   */
  private fireAndForgetCtPaymentMethodSync(operation: () => Promise<unknown>, logContext: string): void {
    void operation().catch((e) => logger.warn(`${logContext}: ${errorMessage(e)}`));
  }

  private validateCartRequiredData(ctCart: Cart, isCartCheckout?: boolean): void {
    if (!isCartCheckout) return;
    if (!ctCart.customerEmail || !ctCart.billingAddress || !ctCart.shippingAddress)
      throw new ErrorInvalidOperation('Required data missing: email or address');
  }

  private validateTransactionSaleParams(
    paymentMethodType: PaymentMethodType,
    paymentMethodNonce: string | undefined,
    paymentToken: string | undefined,
    localPaymentId: string | undefined,
    venmoUsername: string | undefined,
  ): void {
    const tokenBasedMethods = new Set<string>([
      PaymentMethodType.ACH,
      PaymentMethodType.CREDIT_CARD_STORED,
      // PAYPAL_STORED_DISABLED: PaymentMethodType.PAYPAL_STORED,
    ]);
    const localPaymentTypes = new Set<string>(Object.values(LocalPaymentMethodType));

    if (tokenBasedMethods.has(paymentMethodType)) {
      if (!paymentToken) throw new ErrorRequiredField('paymentToken');
    } else {
      if (!paymentMethodNonce) throw new ErrorRequiredField('paymentMethodNonce');
      if (localPaymentTypes.has(paymentMethodType) && !localPaymentId) throw new ErrorRequiredField('localPaymentId');
      if (paymentMethodType === PaymentMethodType.VENMO && !venmoUsername)
        throw new ErrorRequiredField('venmoUsername');
    }
  }

  private validatePaymentMethod(paymentMethodType: PaymentMethodType, braintreeMerchantAccount?: string): void {
    const localPaymentTypes = new Set<string>(Object.values(LocalPaymentMethodType));
    if (localPaymentTypes.has(paymentMethodType) && !braintreeMerchantAccount)
      throw new ErrorRequiredField('braintreeMerchantAccount');
  }

  /* PURE_VAULT_DISABLED start
  private validateCustomerRequiredData(ctCustomer: Customer | void, isPureVault?: boolean): void {
    if (!isPureVault) return;
    if (!ctCustomer) throw new ErrorInvalidOperation('Customer not found for pure vault payment');
  }
  PURE_VAULT_DISABLED end */
}
