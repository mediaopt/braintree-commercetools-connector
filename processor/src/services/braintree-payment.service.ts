import {
  statusHandler,
  healthCheckCommercetoolsPermissions,
  ErrorRequiredField,
  ErrorInvalidOperation,
  Cart,
  Customer,
  Payment,
  Money,
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
  CustomBuilderType,
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
  getClientToken,
  mapCommercetoolsMoneyToBraintreeMoney,
  mapRequestToBraintreeTransactionSale,
  transactionSale,
  mapBraintreeTransactionToCommercetoolsTransaction,
  mapBraintreeVoidToCommercetoolsTransaction,
  mapBraintreeStatusToCommercetoolsTransactionState,
  submitForSettlement,
  getPaymentMethodHint,
  refund as braintreeRefund,
  voidTransaction as braintreeVoidTransaction,
  deletePayment as braintreeDeletePayment,
  getTransaction as braintreeGetTransaction,
} from 'common-connect/dist';
import {
  handleCustomTransactionFields,
  buildResponseActions,
  braintreeFailure,
  braintreePaymentCustom,
  getBraintreePaymentTypeId,
  isBraintreePayment,
  notBraintreePaymentMessage,
  notBraintreePayment,
  CustomFields,
} from '../utils/customEntities.utils';

import {
  BraintreeLineItem,
  buildCartLineItems,
  buildDiscountLineItem,
  DISCOUNT_PRODUCT_CODE,
  lineItemsMatchItemTotal,
  mapCTLineItemToBraintreeLineItem,
  sameLineItems,
} from '../utils/lineItem.utils';
import { amountLeftForPayment, relevantDiscountAmount, relevantShippingAmount, toNum } from '../utils/money.utils';
import {
  braintreeErrorRef,
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
  addPlaceholderActions,
  findActiveCharges,
  findTransactionIdOrUndefined,
  hasCancelledPlaceholder,
  hasOpenPlaceholder,
  hasPlaceholder,
  hasSale,
  isMicroDepositMarker,
  isFailedOrVoided,
  isPlaceholder,
  remainingOnOnlyCharge,
  withoutPlaceholders,
} from '../utils/transaction.utils';
import { BraintreeCustomerService } from './braintree-customer.service';
import {
  AchMicroDepositDeps,
  cancelPlaceholderPayment,
  placeholderOverwriteActions,
  captureMicroDepositAch,
} from './ach-micro-deposit';

// localPayment is an undocumented field Braintree adds to Transaction for local payment methods
// See: https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side/javascript/v3
type TransactionWithLocalPayment = Transaction & {
  localPayment?: { paymentId?: string };
};

// A transactionSale is refused when the cart changed after the payment was created: commercetools Checkout requires new
// payment sessions then
const CART_CHANGED_HINT =
  'if you see this error, please make sure that you call reloadPaymentMethods, see https://docs.commercetools.com/checkout/releases/2025-03-05-introduced-reloadpaymentmethods-method-and-failedtorefreshsession-message';

const sameAmount = (a: { centAmount: number; currencyCode: string }, b: { centAmount: number; currencyCode: string }) =>
  a.centAmount === b.centAmount && a.currencyCode === b.currencyCode;

// Backward compat with extension's updatePaymentFields (common-connect/src/utils/response.utils.ts), which returns the
// mixed payment/customer UpdateActions type
const buildStatusActions = (status: string, method: string): PaymentUpdateAction[] => [
  { action: 'setStatusInterfaceCode', interfaceCode: status },
  { action: 'setStatusInterfaceText', interfaceText: status },
  { action: 'setMethodInfoMethod', method },
];

export class BraintreePaymentService extends AbstractPaymentService {
  private braintreeCustomerService: BraintreeCustomerService;
  // ACH micro-deposit placeholder capture/cancel, kept in ach-micro-deposit.ts
  private achDeps: AchMicroDepositDeps;

  constructor(opts: BraintreePaymentServiceOptions) {
    super(opts.ctCartService, opts.ctPaymentService, opts.ctPaymentMethodService);
    this.braintreeCustomerService = new BraintreeCustomerService({ ctAPI: paymentSDK.ctAPI });
    this.achDeps = {
      getPayment: (id) => this.ctPaymentService.getPayment({ id }),
      getCtCustomer: (id) => this.braintreeCustomerService.getCtCustomer(id),
      rejectPaymentIntent: this.rejectPaymentIntent.bind(this),
      handleBraintreeFailure: this.handleBraintreeFailure.bind(this),
      updatePaymentWithTransaction: this.updatePaymentWithTransaction.bind(this),
      toPaymentIntentResponse: this.toPaymentIntentResponse.bind(this),
    };
  }

  /**
   * Writes a CT payment update with retries (retryCTSync, never throws), one raw CT call per attempt: the first
   * attempt builds the actions from the caller's payment (no fetch), a retry re-fetches. A stale snapshot can't write
   * wrong actions: CT rejects its version (409) and the retry rebuilds them from the current payment.
   * Without a snapshot, the first attempt fetches too. Returns the updated payment, or the snapshot if every attempt
   * failed.
   */
  private async syncPayment(
    ctPaymentId: string,
    snapshot: Payment | undefined,
    buildActions: (payment: Payment) => PaymentUpdateAction[],
    methodName: string,
    syncContext: string,
    maxAttempts?: number,
  ): Promise<Payment | undefined> {
    let next = snapshot;
    let updated = snapshot;
    await retryCTSync(
      async () => {
        const payment = next ?? (await this.ctPaymentService.getPayment({ id: ctPaymentId }));
        next = undefined;
        const actions = buildActions(payment);
        if (!actions.length) return;
        updated = (
          await paymentSDK.ctAPI.client
            .payments()
            .withId({ ID: ctPaymentId })
            .post({ body: { version: payment.version, actions } })
            .execute()
        ).body as Payment;
      },
      methodName,
      ctPaymentId,
      syncContext,
      maxAttempts,
    );
    return updated;
  }

  /**
   * Records a Braintree operation that produced a transaction, in one raw CT call (see syncPayment) — what
   * braintree-extension's payment.service records: the transaction, the interface interactions, its
   * updatePaymentFields (status code/text, method) and {messageName}Response.
   */
  private async updatePaymentWithTransaction({
    messageName,
    request,
    ctPayment,
    response,
    extraFields,
    transactionTypeOverride,
    recordedTransaction,
    methodName,
    syncContext = formatBraintreeSyncContext(response),
    maxAttempts,
  }: {
    messageName: string;
    request: string | object;
    ctPayment: Payment;
    response: Transaction;
    // custom fields besides {messageName}Response (transactionSale: LocalPaymentMethodsPaymentId, BraintreeOrderId)
    extraFields?: Record<string, string>;
    transactionTypeOverride?: TransactionType;
    // recorded instead of the mapped one (void, see voidTransaction)
    recordedTransaction?: ReturnType<typeof mapBraintreeTransactionToCommercetoolsTransaction>;
    // retryCTSync log name and context
    methodName: string;
    syncContext?: string;
    maxAttempts?: number;
  }): Promise<void> {
    const paymentMethodHint = getPaymentMethodHint(response);
    await this.syncPayment(
      ctPayment.id,
      ctPayment,
      (payment) => {
        const mappedTransaction =
          recordedTransaction ?? mapBraintreeTransactionToCommercetoolsTransaction(payment, response);
        const transaction = transactionTypeOverride
          ? { ...mappedTransaction, type: transactionTypeOverride }
          : mappedTransaction;
        return [
          ...this.existingTransactionActions(payment, response, [
            transaction,
            ...(mappedTransaction.type !== transaction.type && mappedTransaction.state !== 'Failure'
              ? [mappedTransaction]
              : []),
          ]),
          // the placeholder of this type was just overwritten with this transaction
          ...(hasOpenPlaceholder(payment, transaction.type)
            ? []
            : paymentSDK.ctPaymentService.consolidateTransactionChanges(payment, transaction)),
          // Braintree's real status can naturally map to something other than the CT Checkout override
          // (e.g. autocapture -> Charge). Record that too (same interactionId) so CT's amountPaid and
          // findActiveCharges (refund/reverse targets) see Braintree's actual state,
          // not just the Authorization entry above. The Failure check is defensive only: a declined sale throws in
          // common-connect's transactionSale before anything is written, so no Failure reaches here.
          // (an ACH capture claim of that type was just overwritten instead)
          ...(transactionTypeOverride &&
          mappedTransaction.type !== transactionTypeOverride &&
          mappedTransaction.state !== 'Failure' &&
          !hasOpenPlaceholder(payment, mappedTransaction.type)
            ? paymentSDK.ctPaymentService.consolidateTransactionChanges(payment, mappedTransaction)
            : []),
          // the SDK's pspReference
          ...(payment.interfaceId ? [] : [{ action: 'setInterfaceId' as const, interfaceId: response.id }]),
          ...buildStatusActions(
            response.status,
            `${response.paymentInstrumentType}${paymentMethodHint ? ` (${paymentMethodHint})` : ''}`,
          ),
          ...buildResponseActions(messageName, request, response, extraFields),
        ];
      },
      methodName,
      syncContext,
      maxAttempts,
    );
  }

  /**
   * The Express amount after a shipping change, computed as createPayment computes amountPlanned and written to it, so
   * the amount approved is the amount charged (transactionSale compares the cart with amountPlanned).
   * The exact total (cart gross minus approved payments) is required: the buyer approves the final amount in the
   * PayPal window ("Pay Now"), otherwise the merchant would have to implement a review page that displays the final
   * amount for approval.
   */
  private async expressCartAmount(cart: Cart): Promise<CentPrecisionMoney> {
    return { type: 'centPrecision', ...(await this.ctCartService.getPaymentAmount({ cart })) };
  }

  /**
   * Changes transactions already on the CT payment — ctPaymentService.updatePayment() can't overwrite an existing
   * interactionId, which the placeholder needs, so it would add a duplicate instead.
   * - ACH placeholders of the recorded types → the real state and Braintree id (placeholderOverwriteActions)
   * - Pending Charge or Refund of a voided transaction → Failure, since no settlement webhook will come and a voided
   *   refund never reached the customer (docs/Intents.md)
   */
  private existingTransactionActions(
    payment: Payment,
    response: Transaction,
    recorded: { type: TransactionType; state: TransactionState }[],
  ): PaymentUpdateAction[] {
    const voidedPending = payment.transactions.filter(
      (t) =>
        response.status === 'voided' &&
        (t.type === 'Charge' || t.type === 'Refund') &&
        t.state === 'Pending' &&
        t.interactionId === response.id,
    );
    return [
      ...placeholderOverwriteActions(payment, response, recorded),
      ...voidedPending.map(
        (t): PaymentUpdateAction => ({ action: 'changeTransactionState', transactionId: t.id, state: 'Failure' }),
      ),
    ];
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
        log.warn(
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
        hasMerchantAccount: !!config.merchantAccountId,
        buttonStyleOverrides: config.buttonStyleOverrides,
        perMethodConfig: config.perMethodConfig,
      };
      log.info('config: success');
      return result;
    } catch (e) {
      log.error(`config: failed — ${errorMessage(e)}`);
      throw e;
    }
  }

  // Displaying the Venmo username in the checkout UI is the merchant's responsibility.
  // After a successful Venmo payment, venmoUsername is appended to the merchantReturnUrl
  // as a query parameter. The merchant's return page should read this value from the URL.
  //
  // Note: this is purely for the redirect — it's not the only place the username ends up.
  // getPaymentMethodHint(response) already reads response.venmoAccount.username independently
  // (Braintree's own transaction record, not this enabler-supplied value) and updatePaymentWithTransaction
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

  // Payment Intents API response — outcome derived from the same CT transaction state written for this Braintree result.
  // Failures never get here: see rejectPaymentIntent / handleBraintreeFailure.
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
   * Failed Braintree call → Braintree's answer recorded on the payment (both call fields + pspInteractions), logged as error,
   * rejected — see docs/Intents.md "How this connector answers".
   */
  private async handleBraintreeFailure({
    ctPayment,
    operation,
    messageName,
    request,
    err,
  }: {
    ctPayment: Payment;
    operation: string;
    messageName: string;
    request: string | object;
    err: unknown;
  }): Promise<PaymentIntentResponseSchemaDTO> {
    await this.recordResponse(
      ctPayment,
      messageName,
      request,
      braintreeFailure(err),
      `${messageName}:failureRecord`,
      '',
    );
    return this.rejectPaymentIntent(
      ctPayment.id,
      operation,
      `Braintree call failed: ${braintreeErrorRef(err)}`,
      'error',
    );
  }

  /**
   * Records a Braintree call that leaves no transaction on the payment (both call fields + pspInteractions), in
   * one raw CT call (see syncPayment). Returns the updated payment, so a caller writing again starts from the current
   * version.
   */
  private async recordResponse(
    ctPayment: Payment,
    messageName: string,
    request: string | object,
    response: string | object,
    methodName: string,
    syncContext: string,
  ): Promise<Payment> {
    const actions = buildResponseActions(messageName, request, response);
    return (await this.syncPayment(ctPayment.id, ctPayment, () => actions, methodName, syncContext)) ?? ctPayment;
  }

  /**
   * Indicates if the feature stored payment methods is enabled/available.
   * It can be enhanced with further checks if so required.
   */
  async isStoredPaymentMethodsEnabled(): Promise<boolean> {
    if (!getStoredPaymentMethodsConfig().enabled) {
      return false;
    }

    // PayPal Express's session may have no Cart before the click
    const cartId = getCartIdFromContext();
    if (!cartId) {
      return false;
    }
    const ctCart = await this.ctCartService.getCart({ id: cartId });

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
                  error: errorMessage(e),
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
      log.error(`status: failed — ${errorMessage(e)}`);
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
          log.error(`getShippingMethods: CT auth error for cart ${ctCartId}`);
        } else {
          log.warn(`getShippingMethods: no shipping available for cart ${ctCartId} — ${errorMessage(err)}`);
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
   * one, is what actually gets stored on the payment (createPayment's getClientToken record).
   */
  public async getExpressClientToken(): Promise<{ braintreeData: { clientToken: string } }> {
    const merchantAccountId = getConfig().merchantAccountId;
    let braintreeCustomerId: string | undefined;
    // PayPal Express's session may have no Cart before the click: anonymous token
    const cartId = getCartIdFromContext();
    if (cartId) {
      try {
        const ctCart = await this.ctCartService.getCart({ id: cartId });
        const customer = ctCart.customerId
          ? await this.braintreeCustomerService.getCtCustomer(ctCart.customerId)
          : undefined;
        braintreeCustomerId = customer?.custom?.fields.braintreeCustomerId;
      } catch (err) {
        log.warn(
          `getExpressClientToken: customer lookup failed for cart ${cartId}, issuing anonymous token — ${errorMessage(err)}`,
        );
      }
    }
    const clientToken = await getClientToken({ merchantAccountId, customerId: braintreeCustomerId });
    return { braintreeData: { clientToken } };
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

  public async createPayment({ builderType }: PaymentRequestSchemaDTO): Promise<PaymentResponseSchemaDTO> {
    const merchantAccountId = getConfig().merchantAccountId;
    // PURE_VAULT_DISABLED: isPureVault detection disabled; feature cancelled
    const isPureVault = false;
    const isExpress = builderType === CustomBuilderType.EXPRESS; // the Express builder is PayPal-only
    const cartId = this.requireCartIdFromContext();
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
      const [customer, shippingMethodsResult, amountPlanned, existingPayment, braintreePaymentTypeId] =
        await Promise.all([
          ctCart.customerId
            ? this.braintreeCustomerService.getCtCustomer(ctCart.customerId)
            : Promise.resolve(undefined),
          isExpress ? this.getShippingMethods(ctCart.id) : Promise.resolve([]),
          this.ctCartService.getPaymentAmount({ cart: ctCart }), // PURE_VAULT_DISABLED: isPureVault ? ctCart.totalPrice :
          lastPaymentRef ? this.ctPaymentService.getPayment({ id: lastPaymentRef.id }) : Promise.resolve(undefined),
          getBraintreePaymentTypeId().catch((err) => {
            log.error(
              `createPayment: could not look up the Braintree payment type, not reusing the cart's last payment — ${errorMessage(err)}`,
            );
            return undefined;
          }),
        ]);

      /* PURE_VAULT_DISABLED start
    this.validateCustomerRequiredData(customer, isPureVault);
     PURE_VAULT_DISABLED end */

      const braintreeCustomerId = customer?.custom?.fields.braintreeCustomerId;
      const shippingMethods = shippingMethodsResult || [];
      const clientTokenRequest = { merchantAccountId, customerId: braintreeCustomerId };

      const reusedPayment = this.reusablePayment(
        // only this connector's payment is reused — the cart may hold other connectors' payments (e.g. gift cards)
        existingPayment && braintreePaymentTypeId && isBraintreePayment(existingPayment, braintreePaymentTypeId)
          ? existingPayment
          : undefined,
        amountPlanned,
      );

      // A new payment is created with the Braintree type, so the token is recorded by setCustomField like every other
      // record — setCustomType would overwrite every custom field
      const [paymentResult, tokenResult] = await Promise.allSettled([
        reusedPayment ??
          this.ctPaymentService.createPayment({
            amountPlanned,
            paymentMethodInfo: { paymentInterface: getConfig().paymentInterface },
            ...customerPaymentInfo,
            paymentStatus: { interfaceCode: 'Initial', interfaceText: 'Initial' },
            checkoutTransactionItemId: getCheckoutTransactionItemIdFromContext(),
            custom: braintreePaymentCustom({}),
          }),
        getClientToken(clientTokenRequest),
      ]);
      if (tokenResult.status === 'rejected') {
        // Braintree's answer recorded on the payment if it exists; fire-and-forget, the buyer is waiting
        if (paymentResult.status === 'fulfilled')
          void this.recordResponse(
            paymentResult.value,
            'getClientToken',
            clientTokenRequest,
            braintreeFailure(tokenResult.reason),
            'getClientToken:failureRecord',
            '',
          );
        throw tokenResult.reason;
      }
      if (paymentResult.status === 'rejected') throw paymentResult.reason;
      const ctPayment = paymentResult.value;
      const clientToken = tokenResult.value;
      if (!ctPayment || !clientToken)
        throw new ErrorInvalidOperation(
          `Payment or token resolution failed, payment id ${ctPayment?.id}, cart id: ${ctCart.id}`,
        );

      await Promise.all([
        !reusedPayment && !isPureVault // PURE_VAULT_DISABLED: unreachable
          ? this.ctCartService.addPayment({
              resource: { id: ctCart.id, version: ctCart.version },
              paymentId: ctPayment.id,
            }) //it is not possible to add the payment to empty cart via checkout API, but for the pure vault all relevant data will be saved on customer anyway
          : Promise.resolve(),
        this.recordResponse(ctPayment, 'getClientToken', clientTokenRequest, clientToken, 'getClientToken:record', ''),
      ]);

      log.info(`createPayment: success, cartId: ${cartId}`);
      return this.buildCreatePaymentResponse(
        ctPayment,
        clientToken,
        ctCart,
        isExpress,
        isPureVault,
        customer ?? undefined,
        shippingMethods,
      );
    } catch (err) {
      // Logged again by the error handler; the duplicate is accepted, as this line gives depersonalized debug data
      // sufficient to request the necessary details
      log.error(`createPayment: failed, cartId: ${cartId} — ${errorMessage(err)}`);
      throw err;
    }
  }

  private reusablePayment(
    existingPayment: Payment | undefined,
    amountPlanned: { centAmount: number; currencyCode: string },
  ): Payment | undefined {
    if (!existingPayment) return undefined;

    return sameAmount(existingPayment.amountPlanned, amountPlanned) && existingPayment.transactions.length === 0
      ? existingPayment
      : undefined;
  }

  private buildCreatePaymentResponse(
    ctPayment: Payment,
    clientToken: string,
    ctCart: Cart,
    isExpress: boolean,
    isPureVault: boolean,
    customer: Customer | undefined,
    shippingMethods: ShippingMethod[],
  ): PaymentResponseSchemaDTO {
    const extendedLineItems = isPureVault ? [] : buildCartLineItems(ctCart, isExpress);
    return {
      braintreeData: { clientToken },
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
    ctPaymentId,
    newShippingMethodId,
    address,
  }: UpdateCartShippingRequestSchemaDTO): Promise<UpdateCartShippingResponseSchemaDTO> {
    const cartId = this.requireCartIdFromContext();
    try {
      const [ctCart, ctPayment] = await Promise.all([
        this.ctCartService.getCart({ id: cartId }),
        this.ctPaymentService.getPayment({ id: ctPaymentId }),
      ]);
      if (!ctCart.paymentInfo?.payments.some(({ id }) => id === ctPaymentId)) {
        throw new ErrorInvalidOperation(`payment ${ctPaymentId} doesn't belong to cart ${ctCart.id}`);
      }
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
          log.warn(`Could not set shipping method ${newShippingMethodId} for cart ${ctCart.id} — ${errorMessage(err)}`);
          return;
        });
      if (!updatedCard) {
        throw new ErrorInvalidOperation(
          `Could not set shipping method ${newShippingMethodId} for cart ${ctCart.id}. Cart not found in CoCo.`,
        );
      }
      // amountPlanned follows the new amount (raw call, the SDK can't change it), awaited before PayPal is shown the
      // amount: transactionSale charges amountPlanned and refuses a cart that no longer matches it. A failed write fails
      // the shipping change (PayPal shows an error in its window).
      const amountPlanned = await this.expressCartAmount(updatedCard);
      const updatedPayment = await this.syncPayment(
        ctPaymentId,
        ctPayment,
        (payment) =>
          sameAmount(payment.amountPlanned, amountPlanned)
            ? []
            : [{ action: 'changeAmountPlanned', amount: amountPlanned }],
        'updateCartShipping',
        '', // no Braintree call to name
      );
      if (!updatedPayment || !sameAmount(updatedPayment.amountPlanned, amountPlanned)) {
        throw new ErrorInvalidOperation(`could not update amountPlanned of payment ${ctPaymentId}`);
      }
      const totalNum = toNum(amountPlanned);
      const shippingNum = toNum(updatedCard.shippingInfo && relevantShippingAmount(updatedCard.shippingInfo));
      const discountNum = toNum(
        updatedCard.discountOnTotalPrice && relevantDiscountAmount(updatedCard.discountOnTotalPrice),
      );
      // taxTotal is always 0: line items and shipping are mapped at gross (see mapCTLineItemToBraintreeLineItem),
      // so tax is already embedded in them for every tax mode, including tax not included in price.

      // amountBreakdown must satisfy PayPal's validation:
      // itemTotal + taxTotal + shipping + handling + insurance - discount - shippingDiscount = amount
      // itemTotal is derived from braintreeAmount rather than summed from line items to avoid rounding drift.
      const itemTotal = (totalNum - shippingNum + discountNum).toFixed(2);
      // Express line items: no shipping line (in the breakdown) and no DISCOUNT credit item (discount is in the breakdown)
      const braintreeLineItems = updatedCard.lineItems.map((lineItem) =>
        mapCTLineItemToBraintreeLineItem(lineItem, updatedCard.locale),
      );
      const shippingAmount = shippingNum.toFixed(2);

      log.info(`updateCartShipping: success, cartId: ${ctCart.id}`);
      return {
        braintreeAmount: totalNum.toFixed(2),
        shippingAmount,
        braintreeBreakdown: lineItemsMatchItemTotal(braintreeLineItems, itemTotal, ctCart.id)
          ? {
              lineItems: braintreeLineItems,
              amountBreakdown: {
                itemTotal,
                taxTotal: '0.00',
                shipping: shippingAmount,
                discount: discountNum.toFixed(2),
                handling: '0.00',
                insurance: '0.00',
                shippingDiscount: '0.00',
              },
            }
          : undefined,
      };
    } catch (err) {
      log.error(`updateCartShipping: failed, cartId: ${cartId} — ${errorMessage(err)}`);
      throw err;
    }
  }

  public async transactionSale({
    ctPaymentId,
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
    // A session without a Cart (PayPal Express before the click) passes auth, but must never charge
    const cartId = this.requireCartIdFromContext(ctPaymentId);
    this.validateTransactionSaleParams(
      ctPaymentId,
      paymentMethodType,
      paymentMethodNonce,
      paymentToken,
      localPaymentId,
      venmoUsername,
    );
    if (paymentMethodType === PaymentMethodType.ACH && !deviceData)
      log.warn(
        `transactionSale for payment ${ctPaymentId} has no deviceData (fraud device data collector failed, was blocked, or had not finished)`,
      );
    const expressShippingChanged = braintreePaymentDetails?.expressShippingChanged === true;
    const [cartRead, paymentRead, braintreePaymentTypeId] = await Promise.all([
      this.ctCartService.getCart({ id: cartId }).then(async (cart) =>
        cart
          ? {
              cart,
              // not the SDK's getPaymentAmount: it doesn't handle async payments properly, a payment carrying the ACH
              // micro-deposit placeholder counts itself as paid. An Express cart must be new, so both are equal there.
              amountPlanned: await amountLeftForPayment(cart, ctPaymentId, (id) =>
                this.ctPaymentService.getPayment({ id }).catch((err) => {
                  // without it, the amount left to pay (and so the amount check) can't be computed
                  log.error(
                    `transactionSale: could not read payment ${id} of cart ${cart.id}, refused payment ${ctPaymentId} — ${errorMessage(err)}`,
                  );
                  throw new ErrorInvalidOperation(`transactionSale refused for payment ${ctPaymentId}`);
                }),
              ),
            }
          : undefined,
      ),
      this.ctPaymentService.getPayment({ id: ctPaymentId }),
      getBraintreePaymentTypeId(),
    ]);
    const { ctPayment, cart } = this.validateTransactionSale(
      ctPaymentId,
      paymentRead,
      braintreePaymentTypeId,
      cartRead,
      braintreePaymentDetails?.braintreeLineItems,
      expressShippingChanged,
    );
    const updatedCart = expressShippingChanged ? cart : undefined;
    const isPayPal = paymentMethodType === 'PayPal'; // PAYPAL_STORED_DISABLED: || paymentMethodType === 'PayPalStored'
    // After an Express shipping change, line items and shipping come from the cart, not the enabler's createPayment
    // copies, built as in updateCartShipping, so they match what it sent to Braintree; amountPlanned is its amount.
    const lineItems = (
      updatedCart ? buildCartLineItems(updatedCart, true) : (braintreePaymentDetails?.braintreeLineItems ?? [])
    )
      // Braintree has 35-char limit for line item names — see https://developers.braintreepayments.com/reference/request/transaction/sale/node#line_items-name
      .map((item) => ({ ...item, name: item.name.substring(0, 35) }))
      // Braintree rejects zero-amount line items for non-PayPal methods; for PayPal, zero amounts are explicitly allowed
      .filter(
        ({ productCode, unitAmount }) => productCode !== DISCOUNT_PRODUCT_CODE && (isPayPal || Number(unitAmount) > 0),
      );
    // discountAmount is derived as the residual needed to balance lineItems (+ shipping, when submitted
    // separately) against the actual charged amount, rather than read from a separately fetched/echoed
    // discount value — this keeps it correct regardless of cart discount type, staleness, or rounding.
    const shippingAmountNum = updatedCart?.shippingInfo ? toNum(relevantShippingAmount(updatedCart.shippingInfo)) : 0;
    const lineItemsTotal = lineItems.reduce((sum, { totalAmount }) => sum + Number(totalAmount), 0);
    // A sale without line items is charged by amount only: there is nothing to derive a discount from.
    const discountResidual = lineItems.length ? lineItemsTotal + shippingAmountNum - toNum(ctPayment.amountPlanned) : 0;
    if (discountResidual < -0.01) {
      log.warn(
        `transactionSale: lineItems total (${lineItemsTotal.toFixed(2)}) plus shipping (${shippingAmountNum.toFixed(2)}) is less than the charged amount (${toNum(ctPayment.amountPlanned).toFixed(2)}) for payment ${ctPaymentId} — discountAmount clamped to 0, check for missing external tax/fees`,
      );
    }
    const { fractionDigits } = ctPayment.amountPlanned;
    const residualDiscount = Math.max(0, discountResidual).toFixed(fractionDigits);
    // PayPal declines a sale whose discount is sent as discountAmount instead of a DISCOUNT credit line item
    // (the form the PayPal order was created with). The credit item is rebuilt from the residual rather than
    // echoed from createPayment, since the cart discount can change after a shipping update.
    const sendDiscountAsLineItem = isPayPal && Number(residualDiscount) > 0;
    if (sendDiscountAsLineItem) lineItems.push(buildDiscountLineItem(residualDiscount));
    const discountAmount = sendDiscountAsLineItem ? (0).toFixed(fractionDigits) : residualDiscount;
    // A vaulting sale attaches the Braintree customer linked on the CT customer (never one named by the request), so
    // the new method is stored with the customer's earlier ones.
    let vaultCustomerId: string | undefined;
    // read before the sale, reused for the customer writes after it (a retry re-reads)
    let ctCustomer: Customer | undefined;
    // the lookup's record, written after the sale together with the link (separate writes would compete with it)
    let findCustomerRecord: CustomFields | undefined;
    if (storeInVaultOnSuccess && ctPayment.customer?.id) {
      // An unreadable CT customer doesn't stop the sale (unlike the ACH vault, vaultPaymentMethodForCustomer): it falls
      // back to the lookup below, and the payment carries enough data to resolve the customer link afterwards
      ctCustomer = await this.braintreeCustomerService.getCtCustomer(ctPayment.customer.id);
      vaultCustomerId = ctCustomer?.custom?.fields?.braintreeCustomerId;
      // braintreeCustomerId can be missing because the CT custom field was wiped (frequently occurring checkout redeploy from merchant center issue),
      // not because the customer is new. Check for a pre-existing Braintree customer
      // (ids are equal to the CT customer id by construction) before embedding an inline "create customer"
      // payload — otherwise Braintree rejects the whole sale with "Customer ID has already been taken"
      // when that customer already exists.
      if (!vaultCustomerId)
        ({ braintreeCustomerId: vaultCustomerId, recordFields: findCustomerRecord } =
          await this.braintreeCustomerService.findExistingBraintreeCustomerId(ctPayment.customer.id));
    }
    // the lookup's record alone, when no link carries it
    const recordFindCustomer = () =>
      findCustomerRecord &&
      this.braintreeCustomerService.recordCustomerFields(
        ctPayment.customer!.id,
        findCustomerRecord,
        'find',
        ctCustomer,
      );
    const optionalRequestData: Partial<TransactionRequest> = {
      ...(storeInVaultOnSuccess && ctPayment.customer?.id
        ? vaultCustomerId
          ? { customerId: vaultCustomerId } // attach to the existing Braintree customer instead of re-creating it
          : { customer: { id: ctPayment.customer.id } }
        : {}),
      lineItems,
      discountAmount,
      ...(updatedCart
        ? {
            shippingAmount: shippingAmountNum.toFixed(fractionDigits),
          } //will be only submitted in express mode, then shipping was submitted via SDK through update and can be mapped here, otherwise it is included in line items
        : {}), //see enabler PayPalMask onShippingChange and onApprove
      ...(deviceData ? { deviceData } : {}),
      ...(braintreePaymentDetails?.braintreeShipping ? { shipping: braintreePaymentDetails.braintreeShipping } : {}),
      ...(achMandateText
        ? { usBankAccount: { achMandateText, achMandateAcceptedAt: achMandateAcceptedAt ?? new Date().toISOString() } }
        : {}),
    };
    const transactionRequest = mapRequestToBraintreeTransactionSale(
      ctPayment,
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
      log.error(`transactionSale: Braintree call failed, paymentId: ${ctPaymentId} — ${braintreeErrorRef(e)}`);
      recordFindCustomer();
      // Braintree's answer recorded on the payment, no transaction; fire-and-forget, the buyer is waiting
      void this.recordResponse(
        ctPayment,
        'transactionSale',
        transactionRequest,
        braintreeFailure(e),
        'transactionSale:failureRecord',
        '',
      );
      // Braintree's answer is recorded, not sent back: this message reaches the browser.
      throw new ErrorInvalidOperation(`transactionSale failed for payment ${ctPaymentId}`);
    }
    warnOnFieldMismatch(ctPaymentId, [
      {
        fieldName: 'localPaymentId',
        enablerValue: localPaymentId,
        braintreeValue: (response as TransactionWithLocalPayment).localPayment?.paymentId,
      },
      { fieldName: 'venmoUsername', enablerValue: venmoUsername, braintreeValue: response.venmoAccount?.username },
    ]);
    const extraFields: Record<string, string> = {};
    handleCustomTransactionFields(extraFields, response, ctPayment);
    // A sale sent with customerId is answered with that customer (Braintree's contract, covered by braintree-extension's
    // live test "transaction with customerId keeps that customer"), so the link below never meets another stored id;
    // it would keep the stored one anyway
    if (vaultCustomerId && response.customer?.id !== vaultCustomerId)
      log.error(
        `transactionSale: Braintree answered with another customer than the sent one on payment ${ctPaymentId}, commercetools customer ${ctPayment.customer?.id}: ${response.customer?.id} — please report this to Braintree immediately`,
      );
    // Fire-and-forget: customer update has no webhook fallback, so retries are handled
    // internally in linkBraintreeCustomerId, but it does not block the transaction response.
    if (storeInVaultOnSuccess && response.customer?.id && ctPayment.customer?.id) {
      void this.braintreeCustomerService.linkBraintreeCustomerId(
        ctPayment.customer.id,
        response.customer.id,
        findCustomerRecord,
        ctCustomer,
      );
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
    } else recordFindCustomer();
    // CT sync — Braintree already processed. Awaited so the Authorization transaction (which triggers
    // commercetools Checkout's Order creation) is written before the response; retryCTSync never throws,
    // so a CT failure still returns the Braintree result. Local payments have a notifications fallback
    // (local_payment_completed webhook, see notifications.controller.ts → handleLocalPaymentCompleted), so 1 attempt
    // is sufficient; non-local methods get full retry with backoff, no notifications fallback
    await this.updatePaymentWithTransaction({
      messageName: 'transactionSale',
      request: transactionRequest,
      ctPayment,
      response,
      extraFields,
      // Recorded as an Authorization whatever Braintree's status maps to (an autocaptured sale maps to Charge):
      // commercetools Checkout creates the Order when the payment gets an Authorization. The mapped transaction is
      // recorded too (see updatePaymentWithTransaction). Only the sale needs this.
      transactionTypeOverride: 'Authorization',
      methodName: 'transactionSale',
      syncContext: formatBraintreeSyncContext(response, [paypalOrderId && `paypalOrderId: ${paypalOrderId}`]),
      // Local payments have a webhook fallback (local_payment_completed → handleLocalPaymentCompleted
      // in braintree-notifications), so 1 attempt is sufficient — the webhook handles recovery if
      // CT sync fails here. Non-local payments have no fallback, so full retries apply.
      maxAttempts: localPaymentId ? 1 : undefined,
    });
    if (response.paymentInstrumentType === 'venmo_account' && !venmoUsername) {
      log.warn(`transactionSale: Venmo username missing in request for payment ${ctPayment.id}`);
    }
    log.info(`transactionSale: success, paymentId: ${ctPaymentId}`);
    return this.paymentActionSuccessResponse(ctPayment.id, undefined, venmoUsername);
  }

  // see docs/Intents.md "Capture"; see also extension module submitForSettlement
  public async settlement(request: ModifyPaymentWithTransactionRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment, amount, merchantReference } = request;
    // the Authorization given as merchantReference, otherwise the last one. merchantReference is used as a Braintree id
    // because capturePayment has no transactionId — see docs/Intents.md "Call parameters"
    // (https://docs.commercetools.com/checkout/payment-intents-api)
    // merchantReference may be the micro-deposit marker: then it's the micro-deposit Authorization below
    const transactionId = isMicroDepositMarker(ctPayment, merchantReference)
      ? undefined
      : (merchantReference ?? findTransactionIdOrUndefined(ctPayment, 'Authorization'));
    // ACH micro-deposit: no Braintree transaction yet, only the verified bank account — docs/Intents.md
    // "ACH micro-deposit verification"
    const microDepositAuthorization =
      !transactionId && ctPayment.transactions.find((t) => isPlaceholder(t, 'Authorization'));
    if (microDepositAuthorization)
      return captureMicroDepositAch(this.achDeps, ctPayment, microDepositAuthorization, amount);
    if (!transactionId)
      return this.rejectPaymentIntent(ctPayment.id, 'settlement', 'no transaction suitable for settlement');
    const authorization = withoutPlaceholders(ctPayment).transactions.find(
      (t) => t.type === 'Authorization' && t.interactionId === transactionId,
    );
    if (!authorization)
      return this.rejectPaymentIntent(
        ctPayment.id,
        'settlement',
        // never the merchant-given id: whatever it carries (e.g. a vault token) mustn't reach the log
        "the transaction given as merchantReference isn't an Authorization of the payment",
      );
    if (isFailedOrVoided(ctPayment, transactionId))
      return this.rejectPaymentIntent(ctPayment.id, 'settlement', 'the transaction already failed or was voided');
    // Full capture = the first capture of this Authorization, for its whole amount. Decided from the transactions only:
    // a full capture's Charge carries the Authorization's id, a partial capture's Charge its child's id, which can't
    // be attributed to an Authorization on commercetools — so any partial capture on the payment means partial.
    const authorizationIds = new Set(
      ctPayment.transactions.filter((t) => t.type === 'Authorization').map((t) => t.interactionId),
    );
    const charges = ctPayment.transactions.filter((t) => t.type === 'Charge');
    const isFullCapture =
      authorization.amount.centAmount === amount.centAmount &&
      !charges.some((t) => t.interactionId === transactionId) &&
      !charges.some((t) => !authorizationIds.has(t.interactionId));
    const braintreeAmount = isFullCapture
      ? undefined
      : mapCommercetoolsMoneyToBraintreeMoney({ ...ctPayment.amountPlanned, ...amount });
    // what is sent to Braintree; same shape as the extension's submitForSettlement request
    const braintreeRequest = { transactionId, amount: braintreeAmount };
    let response: Transaction;
    try {
      response = await submitForSettlement(transactionId, braintreeAmount);
    } catch (err) {
      return await this.handleBraintreeFailure({
        ctPayment,
        operation: 'settlement',
        messageName: 'submitForSettlement',
        request: braintreeRequest,
        err,
      });
    }
    // CT sync — Braintree already settled; awaited (retryCTSync never throws), no notifications fallback
    await this.updatePaymentWithTransaction({
      messageName: 'submitForSettlement',
      request: braintreeRequest,
      ctPayment,
      response,
      methodName: 'settlement',
    });
    log.info(`settlement: success, paymentId: ${ctPayment.id}`);
    return this.toPaymentIntentResponse(response);
  }

  /**
   * Refund payment — target and pre-check per docs/Intents.md "Refund".
   *
   * @param request - payment, refund amount and optional Braintree transaction id of the capture to refund
   * @returns PaymentIntentResponseSchemaDTO
   */
  async refundPayment(request: ModifyPaymentWithTransactionRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment, amount } = request;
    const target = this.resolveTarget(ctPayment, 'refundPayment', request.transactionId, 'capture');
    if ('rejected' in target) return target.rejected;
    const { transactionId } = target;
    if (!transactionId) return this.rejectPaymentIntent(ctPayment.id, 'refundPayment', 'no capture to refund');
    const remaining = remainingOnOnlyCharge(ctPayment, transactionId);
    if (remaining !== undefined && remaining < amount.centAmount)
      return this.rejectPaymentIntent(ctPayment.id, 'refundPayment', 'refund exceeds what is left on the capture');
    return this.refundTransaction(ctPayment, transactionId, amount, 'refundPayment');
  }

  // Braintree refund + CT sync; without amount Braintree refunds what is left on the transaction
  private async refundTransaction(
    ctPayment: Payment,
    relevantTransactionId: string,
    amount: Money | undefined,
    operation: string,
  ): Promise<PaymentIntentResponseSchemaDTO> {
    const braintreeAmount = amount
      ? mapCommercetoolsMoneyToBraintreeMoney({ ...ctPayment.amountPlanned, ...amount })
      : undefined;
    // what is sent to Braintree; same shape as the extension's refund request
    const braintreeRequest = { transactionId: relevantTransactionId, amount: braintreeAmount };
    let response: Transaction;
    try {
      response = await braintreeRefund(relevantTransactionId, braintreeAmount);
    } catch (err) {
      return await this.handleBraintreeFailure({
        ctPayment,
        operation,
        messageName: 'refund',
        request: braintreeRequest,
        err,
      });
    }
    // CT sync — Braintree already refunded; awaited (retryCTSync never throws), no notifications fallback
    await this.updatePaymentWithTransaction({
      messageName: 'refund',
      request: braintreeRequest,
      ctPayment,
      response,
      methodName: operation,
    });
    log.info(`${operation}: refund success, paymentId: ${ctPayment.id}`);
    return this.toPaymentIntentResponse(response);
  }

  // see docs/Intents.md "Cancel"
  async void(request: CancelPaymentRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment, merchantReference } = request;
    const target = this.resolveTarget(ctPayment, 'void', merchantReference, 'authorization');
    if ('rejected' in target) return target.rejected;
    const { transactionId } = target;
    if (!transactionId) return this.cancelPlaceholderOrReject(ctPayment, 'void');
    if (isFailedOrVoided(ctPayment, transactionId))
      return this.rejectPaymentIntent(ctPayment.id, 'void', 'the transaction already failed or was voided');
    return this.voidTransaction(ctPayment, transactionId, 'void');
  }

  // Braintree void of one transaction + CT sync (docs/Intents.md "After a void")
  private async voidTransaction(
    ctPayment: Payment,
    transactionId: string,
    operation: string,
  ): Promise<PaymentIntentResponseSchemaDTO> {
    let response: Transaction;
    try {
      response = await braintreeVoidTransaction(transactionId);
    } catch (err) {
      return await this.handleBraintreeFailure({
        ctPayment,
        operation,
        messageName: 'void',
        request: { transactionId },
        err,
      });
    }
    // CT sync — Braintree already voided; awaited (retryCTSync never throws), no notifications fallback
    await this.updatePaymentWithTransaction({
      messageName: 'void',
      request: { transactionId },
      ctPayment,
      response,
      // backward compatibility with braintree-extension: a void is always recorded as a new CancelAuthorization, also
      // for a voided refund — mapBraintreeTransactionToCommercetoolsTransaction would instead mark the existing Refund
      // as Success, i.e. as money returned to the customer, though Braintree cancelled that refund
      recordedTransaction: mapBraintreeVoidToCommercetoolsTransaction(response, ctPayment.amountPlanned),
      methodName: operation,
    });
    log.info(`${operation}: void success, paymentId: ${ctPayment.id}`);
    return this.toPaymentIntentResponse(response);
  }

  // see docs/Intents.md "Reverse"
  async reversePayment(request: CancelPaymentRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment, merchantReference } = request;
    const target = this.resolveTarget(ctPayment, 'reversePayment', merchantReference, 'captureOrAuthorization');
    if ('rejected' in target) return target.rejected;
    const { transactionId } = target;
    if (!transactionId) return this.cancelPlaceholderOrReject(ctPayment, 'reversePayment');
    const remaining = remainingOnOnlyCharge(ctPayment, transactionId);
    if (remaining !== undefined && remaining <= 0)
      return this.rejectPaymentIntent(ctPayment.id, 'reversePayment', 'already fully refunded');
    if (isFailedOrVoided(ctPayment, transactionId))
      return this.rejectPaymentIntent(ctPayment.id, 'reversePayment', 'the transaction already failed or was voided');
    // Recorded as findTransaction, though the call is Braintree's transaction.find by id (common-connect's
    // getTransaction): backward compatibility, findTransactionResponse is the extension's field name for its lookup
    let braintreeTransaction: Transaction;
    try {
      braintreeTransaction = await braintreeGetTransaction(transactionId);
    } catch (err) {
      return this.handleBraintreeFailure({
        ctPayment,
        operation: 'reversePayment',
        messageName: 'findTransaction',
        request: { transactionId },
        err,
      });
    }
    // recorded as on failure, and as braintree-extension records its findTransaction lookup; the void/refund below
    // continues from the payment it returns (current version)
    const recordedPayment = await this.recordResponse(
      ctPayment,
      'findTransaction',
      { transactionId },
      braintreeTransaction,
      'findTransaction:record',
      formatBraintreeSyncContext(braintreeTransaction),
    );
    const { status } = braintreeTransaction;
    if (status === 'settling' || status === 'settled' || status === 'settlement_confirmed') {
      return this.refundTransaction(recordedPayment, transactionId, undefined, 'reversePayment');
    }
    if (status === 'authorized' || status === 'submitted_for_settlement' || status === 'settlement_pending') {
      return this.voidTransaction(recordedPayment, transactionId, 'reversePayment');
    }
    return this.rejectPaymentIntent(
      ctPayment.id,
      'reversePayment',
      `Braintree transaction status ${status} can't be reversed`,
    );
  }

  /**
   * No Braintree transaction to act on: an unverified ACH payment (only the placeholder) is cancelled on
   * commercetools, anything else is rejected.
   */
  private async cancelPlaceholderOrReject(
    ctPayment: Payment,
    operation: string,
  ): Promise<PaymentIntentResponseSchemaDTO> {
    if (hasPlaceholder(ctPayment)) return cancelPlaceholderPayment(this.achDeps, ctPayment, operation);
    return this.rejectPaymentIntent(ctPayment.id, operation, 'no linked Braintree transaction to act on');
  }

  /**
   * Target of refund / cancel / reverse (docs/Intents.md "Call parameters"): a merchant-given id must match a
   * (non-placeholder) transaction on the payment; without one, the operation's default — the single active capture
   * (refund), the Authorization (cancel), or the single active capture else the Authorization (reverse).
   * Cancel and reverse have no transactionId in the Payment Intents API
   * (https://docs.commercetools.com/checkout/payment-intents-api), so merchantReference is their only way to name a
   * target; an id that matches nothing is rejected rather than ignored, so a mistyped id can't act on the default target.
   */
  private resolveTarget(
    ctPayment: Payment,
    operation: string,
    givenId: string | undefined,
    defaultTarget: 'capture' | 'authorization' | 'captureOrAuthorization',
  ): { transactionId: string | undefined } | { rejected: PaymentIntentResponseSchemaDTO } {
    // the ACH micro-deposit marker: no Braintree transaction behind it yet, so no target (the placeholder path)
    if (isMicroDepositMarker(ctPayment, givenId)) return { transactionId: undefined };
    if (givenId) {
      if (withoutPlaceholders(ctPayment).transactions.some((t) => t.interactionId === givenId))
        return { transactionId: givenId };
      return {
        rejected: this.rejectPaymentIntent(
          ctPayment.id,
          operation,
          // never the merchant-given id: whatever it carries (e.g. a vault token) mustn't reach the log
          "the given transaction doesn't belong to the payment",
        ),
      };
    }
    const authorizationId = findTransactionIdOrUndefined(ctPayment, 'Authorization');
    if (defaultTarget === 'authorization') return { transactionId: authorizationId };
    const charges = findActiveCharges(ctPayment);
    if (charges.length > 1)
      return {
        rejected: this.rejectPaymentIntent(
          ctPayment.id,
          operation,
          'more than one capture — send the Braintree transaction id of the target',
        ),
      };
    const chargeId = charges[0]?.interactionId;
    return { transactionId: defaultTarget === 'capture' ? chargeId : (chargeId ?? authorizationId) };
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
    log.info(`triggering vault, ${braintreeCustomerId}`);
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
   *    MERCHANT RESPONSIBILITY: Braintree sends no verification webhook. The merchant confirms the micro-transfer
   *    amounts (usBankAccountVerification.confirmMicroTransferAmounts) and then captures through the Payment Intents
   *    API (settlement, a sale with the vault token in the placeholder's marker — see docs/Intents.md
   *    "ACH micro-deposit verification"). The transaction_* webhooks in braintree-notifications then track that
   *    sale's settlement.
   *    NOT OFFICIALLY SUPPORTED: this path (requested with micro_transfers) is kept so that an unverified bank account
   *    doesn't leave the payment stuck at a dead end without any resolution. Merchants who want the micro-deposit flow
   *    MUST open an issue to get full support (enabler/README.md#ach).
   */
  public async getAchVaultToken({
    paymentMethodNonce,
    ctPaymentId,
    logFrontendIssue,
  }: AchVaultTokenRequestSchemaDTO): Promise<AchVaultTokenResponseSchemaDTO> {
    // Before the cart guard, so a rejected request still logs the issue it reports
    if (logFrontendIssue)
      log.warn(
        `getAchVaultToken: frontend issue reported on payment ${ctPaymentId} before this attempt: ${logFrontendIssue}`,
      );
    // A session without a Cart (PayPal Express before the click) passes auth, but must never vault
    const cartId = this.requireCartIdFromContext(ctPaymentId);
    // The vault goes to the cart's customer, so the cart is read before it (the Braintree customer lookup needs its id).
    // Payment and type are read in parallel with both, so a payment without the Braintree type can't be refused
    // before Braintree. A failed read must not fail the vault: the type then isn't checked, and syncPayment fetches.
    const [{ token, verified, ctCustomerId }, braintreePaymentTypeId, ctPayment] = await Promise.all([
      this.ctCartService
        .getCart({ id: cartId })
        .then(({ customerId }) =>
          this.braintreeCustomerService.vaultPaymentMethodForCustomer({ paymentMethodNonce, ctCustomerId: customerId }),
        ),
      getBraintreePaymentTypeId().catch(() => undefined),
      this.ctPaymentService.getPayment({ id: ctPaymentId }).catch(() => undefined),
    ]);

    // Symmetric with linkBraintreeCustomerId (called inside vaultPaymentMethodForCustomer): also register
    // the vaulted method in commercetools' own PaymentMethod resource. Best-effort — Braintree's vault
    // above already succeeded and remains authoritative; see the class-level note in abstract-payment.service.ts.
    // Fire-and-forget so it doesn't add latency to the vault-token response.
    this.fireAndForgetCtPaymentMethodSync(
      () =>
        this.ctPaymentMethodService.save({
          customerId: ctCustomerId,
          method: PaymentMethodType.ACH,
          paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
          token,
        }),
      `getAchVaultToken: could not save commercetools PaymentMethod record for payment ${ctPaymentId}`,
    );

    if (!verified) {
      // The placeholder write needs no custom type, so it still goes ahead; the merchant is told to resolve the type.
      if (ctPayment && braintreePaymentTypeId && !isBraintreePayment(ctPayment, braintreePaymentTypeId))
        log.error(
          `getAchVaultToken: ${notBraintreePaymentMessage(ctPaymentId)} The pending placeholder is written, but resolve the type manually: every later operation on this payment is refused until then.`,
        );
      // Awaited — this placeholder is the write that triggers commercetools Checkout's Order creation, so it must
      // exist before the settlement_pending redirect goes out (retryCTSync never throws).
      await this.syncPayment(
        ctPaymentId,
        ctPayment,
        (payment) => [
          // interfaceText follows the project convention: short Braintree status string (same as response.status in
          // updatePaymentWithTransaction and common-connect/src/utils/response.utils.ts)
          ...buildStatusActions('settlement_pending', 'us_bank_account'),
          ...addPlaceholderActions(payment, token),
        ],
        'getAchVaultToken:pendingSync',
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
    const ctCart = await this.ctCartService.getCart({ id: this.requireStoredPaymentMethodsCartId() });
    if (!ctCart.customerId) {
      log.warn('getStoredPaymentMethods: cart has no customerId, returning empty');
      return { storedPaymentMethods: [] };
    }
    const ctCustomer = await this.braintreeCustomerService.getCtCustomer(ctCart.customerId);
    const braintreeCustomerId = ctCustomer?.custom?.fields?.braintreeCustomerId;
    if (!braintreeCustomerId) {
      log.warn(`getStoredPaymentMethods: CT customer ${ctCart.customerId} has no braintreeCustomerId, returning empty`);
      return { storedPaymentMethods: [] };
    }
    const gateway = await getBraintreeGateway();
    try {
      const btCustomer = await gateway.customer.find(braintreeCustomerId);
      this.braintreeCustomerService.recordCustomerCall(
        ctCart.customerId,
        'find',
        { customerId: braintreeCustomerId },
        btCustomer,
        ctCustomer,
      );
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
      log.info(`getStoredPaymentMethods: customer ${braintreeCustomerId} — creditCards: ${creditCards.length}`);
      if (!creditCards.length) {
        log.warn(`No stored payment methods returned by Braintree for customer ${braintreeCustomerId}`);
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
                log.warn(
                  `getStoredPaymentMethods: Braintree/commercetools credit card counts differ for customer ${braintreeCustomerId} — Braintree: ${creditCards.length}, commercetools: ${ctCreditCardCount}`,
                );
              }
            }),
        'getStoredPaymentMethods: could not cross-check against commercetools PaymentMethod records',
      );
      return { storedPaymentMethods: [...creditCards] };
    } catch (e) {
      log.warn(`Could not find Braintree customer ${braintreeCustomerId}: ${braintreeErrorRef(e)}`);
      this.braintreeCustomerService.recordCustomerCall(
        ctCart.customerId,
        'find',
        { customerId: braintreeCustomerId },
        braintreeFailure(e),
        ctCustomer,
      );
      return { storedPaymentMethods: [] };
    }
  }

  public async deleteStoredPaymentMethod(token: string): Promise<void> {
    // Before the Braintree delete starts: the cart read below runs in parallel with it
    const cartId = this.requireStoredPaymentMethodsCartId();
    const cartRead = this.ctCartService.getCart({ id: cartId }).catch(() => undefined);
    // recorded on the cart's customer; Braintree answers a delete with no body
    const record = (response: unknown) =>
      void cartRead.then(
        (cart) =>
          cart?.customerId &&
          this.braintreeCustomerService.recordCustomerCall(
            cart.customerId,
            'deletePayment',
            { paymentMethodToken: token },
            response,
          ),
      );
    let ctCart: Cart | undefined;
    try {
      [, ctCart] = await Promise.all([braintreeDeletePayment(token), cartRead]);
      // the extension's deletePaymentResponse on success
      record('success');
      log.info(`deleteStoredPaymentMethod: success, cartId: ${cartId}`);
    } catch (err) {
      record(braintreeFailure(err));
      // Logged again by the error handler; the duplicate is accepted, as this line gives depersonalized debug data
      // sufficient to request the necessary details
      log.error(`deleteStoredPaymentMethod: failed, cartId: ${cartId} — ${braintreeErrorRef(err)}`);
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
    void operation().catch((e) => log.warn(`${logContext}: ${errorMessage(e)}`));
  }

  // Stored payment methods aren't supported for commercetools Express Checkout, whose session may
  // have no Cart. Supporting them would need commercetools to support it as well. Please open an
  // issue if you are interested in stored payment methods for Express Checkout.
  private requireStoredPaymentMethodsCartId(): string {
    return this.requireCartIdFromContext();
  }

  // For flows that can't work without a Cart; paymentId only identifies the failing request
  private requireCartIdFromContext(paymentId?: string): string {
    const cartId = getCartIdFromContext();
    if (!cartId) {
      throw new ErrorInvalidOperation(`no cart found for ${paymentId ?? 'the checkout session'}`);
    }
    return cartId;
  }

  private validateCartRequiredData(ctCart: Cart, isCartCheckout?: boolean): void {
    if (!isCartCheckout) return;
    if (!ctCart.customerEmail || !ctCart.billingAddress || !ctCart.shippingAddress)
      throw new ErrorInvalidOperation('Required data missing: email or address');
  }

  /**
   * The transactionSale checks that need the payment and the cart: a Braintree payment, not cancelled or already
   * charged, whose cart still has amountPlanned and its line items. Logs and throws, so nothing reaches Braintree. The
   * request's own fields are checked before anything is read (validateTransactionSaleParams).
   */
  private validateTransactionSale(
    ctPaymentId: string,
    ctPayment: Payment | undefined,
    braintreePaymentTypeId: string,
    cartRead: { cart: Cart; amountPlanned: CentPrecisionMoney } | undefined,
    submittedLineItems: BraintreeLineItem[] | undefined,
    expressShippingChanged: boolean,
  ): { ctPayment: Payment; cart: Cart } {
    if (!ctPayment) {
      throw new ErrorInvalidOperation(`payment is missing for transactionSale payment ${ctPaymentId}}`);
    }
    if (!isBraintreePayment(ctPayment, braintreePaymentTypeId)) {
      log.error(`transactionSale: ${notBraintreePaymentMessage(ctPaymentId)}`);
      throw new ErrorInvalidOperation(notBraintreePayment(ctPaymentId));
    }
    // Unverified ACH payment whose Order was cancelled before the micro-deposits were verified (cancelPlaceholderPayment)
    if (hasCancelledPlaceholder(ctPayment)) {
      throw new ErrorInvalidOperation(
        `transactionSale refused — payment ${ctPaymentId} was cancelled before verification`,
      );
    }
    if (!cartRead) throw new ErrorInvalidOperation(`could not find cart for transactionSale payment ${ctPaymentId}`);
    // Checkout creates one payment per checkout and charges it once
    if (hasSale(ctPayment)) {
      log.error(`merchant integration issue: transactionSale called again on already charged payment ${ctPaymentId}`);
      throw new ErrorInvalidOperation(`transactionSale refused for payment ${ctPaymentId}`);
    }
    // PayPal doesn't enforce the approved amount itself (it accepts a sale below it), so the cart must still be what the
    // buyer was shown: amountPlanned (createPayment, or Express's last updateCartShipping) and the line items
    const cartChange = !sameAmount(cartRead.amountPlanned, ctPayment.amountPlanned)
      ? 'amount'
      : !sameLineItems(submittedLineItems, cartRead.cart, expressShippingChanged)
        ? 'line items'
        : undefined;
    if (cartChange) {
      log.error(
        `merchant integration issue: cart ${cartChange} changed after payment creation on payment ${ctPaymentId} — ${CART_CHANGED_HINT}`,
      );
      // the log above is for the merchant only; the buyer gets the enabler's general failure message
      throw new ErrorInvalidOperation(`transactionSale refused for payment ${ctPaymentId}`);
    }
    return { ctPayment, cart: cartRead.cart };
  }

  private validateTransactionSaleParams(
    ctPaymentId: string,
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
      if (localPaymentTypes.has(paymentMethodType)) {
        if (!localPaymentId) throw new ErrorRequiredField('localPaymentId');
        // Shouldn't happen with proper use of the Checkout connector (without a merchant account local methods are
        // neither listed nor available in the enabler); a synchronous fallback for self-hosting merchants mimicking it
        if (!getConfig().merchantAccountId) {
          log.error(
            `merchant integration issue: local payment method ${paymentMethodType} requires BRAINTREE_MERCHANT_ACCOUNT, payment ${ctPaymentId}`,
          );
          // the setting is named for the merchant only; the buyer gets the enabler's general failure message
          throw new ErrorInvalidOperation(`transactionSale refused for payment ${ctPaymentId}`);
        }
      }
      if (paymentMethodType === PaymentMethodType.VENMO && !venmoUsername)
        throw new ErrorRequiredField('venmoUsername');
    }
  }

  /* PURE_VAULT_DISABLED start
  private validateCustomerRequiredData(ctCustomer: Customer | void, isPureVault?: boolean): void {
    if (!isPureVault) return;
    if (!ctCustomer) throw new ErrorInvalidOperation('Customer not found for pure vault payment');
  }
  PURE_VAULT_DISABLED end */
}
