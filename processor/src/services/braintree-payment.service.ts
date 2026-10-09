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
  logger,
} from 'common-connect/dist';
import {
  handleCustomTransactionFields,
  handleCustomFieldResponse,
  buildPspInteractions,
  buildResponseActions,
  withBraintreeType,
  getBraintreePaymentTypeId,
  isBraintreePayment,
  notBraintreePaymentMessage,
  notBraintreePayment,
} from '../utils/customEntities.utils';

import {
  BraintreeLineItem,
  LineItemKind,
  mapCTLineItemToBraintreeLineItem,
  lineItemPlaceholders,
} from '../utils/lineItem.utils';
import { relevantDiscountAmount, relevantShippingAmount, toNum } from '../utils/money.utils';
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
  addPlaceholderActions,
  findActiveCharges,
  findTransactionIdOrUndefined,
  hasCancelledPlaceholder,
  hasPlaceholder,
  isFailedOrVoided,
  isPlaceholder,
  remainingOnOnlyCharge,
  withoutPlaceholders,
} from '../utils/transaction.utils';
import { BraintreeCustomerService } from './braintree-customer.service';

// docs/Intents.md "ACH micro-deposit verification"
export const CONCURRENT_CANCEL_AND_SALE_ISSUE =
  'merchant integration issue: ct cancel and capture (Braintree transaction.sale) called concurrently';

// localPayment is an undocumented field Braintree adds to Transaction for local payment methods
// See: https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side/javascript/v3
type TransactionWithLocalPayment = Transaction & {
  localPayment?: { paymentId?: string };
};

// Single source for the DISCOUNT credit item — transactionSale filters on and rebuilds this exact shape for PayPal.
const DISCOUNT_PRODUCT_CODE = 'DISCOUNT';
const buildDiscountLineItem = (amount: string) => ({
  name: 'Discount',
  kind: 'credit' as LineItemKind,
  unitAmount: amount,
  totalAmount: amount,
  productCode: DISCOUNT_PRODUCT_CODE,
  ...lineItemPlaceholders,
});

/**
 * Checks that the line items add up to the itemTotal of the amount breakdown.
 *
 * itemTotal is derived from the cart total (total - shipping + discount), while the line items are mapped one by one
 * (see mapCTLineItemToBraintreeLineItem). The two are computed independently, so they can drift apart because of how
 * commercetools rounds:
 * - tax rounding (taxRoundingMode, taxCalculationMode LineItemLevel vs UnitPriceLevel)
 * - price rounding (priceRoundingMode)
 * - discount rounding (a cart discount split across line items, discountedGrossAmount vs discountedAmount)
 *
 * Braintree rejects a breakdown that doesn't fit its line items (ITEM_TOTAL_MISMATCH). No payment method in this
 * connector requires a breakdown (only PayPal Express receives one), so on a mismatch it is omitted.
 * A missing breakdown hides the item list in the PayPal window (only subtotal, shipping and total are shown).
 * If you experience this, please open an issue with the anonymized cart.
 *
 * Carts paid partly by another payment (e.g. a gift card) or containing custom line items are not supported yet
 * Please open an issue if you are interested in these features.
 */
const lineItemsMatchItemTotal = (lineItems: BraintreeLineItem[], itemTotal: string, cartId: string): boolean => {
  const lineItemTotal = lineItems.reduce((sum, { totalAmount }) => sum + Number(totalAmount), 0).toFixed(2);
  if (lineItemTotal === itemTotal) return true;
  logger.warn(
    `updateCartShipping: line items total (${lineItemTotal}) does not match itemTotal (${itemTotal}) for cart ${cartId}, the Braintree payment is updated without breakdown — please open an issue with the anonymized cart (prices, taxes, discounts, rounding settings) so the breakdown can be supported`,
  );
  return false;
};

// Backward compat with extension's updatePaymentFields (common-connect/src/utils/response.utils.ts), which returns the
// mixed payment/customer UpdateActions type
const buildStatusActions = (status: string, method: string): PaymentUpdateAction[] => [
  { action: 'setStatusInterfaceCode', interfaceCode: status },
  { action: 'setStatusInterfaceText', interfaceText: status },
  { action: 'setMethodInfoMethod', method },
];

export class BraintreePaymentService extends AbstractPaymentService {
  private braintreeCustomerService: BraintreeCustomerService;

  constructor(opts: BraintreePaymentServiceOptions) {
    super(opts.ctCartService, opts.ctPaymentService, opts.ctPaymentMethodService);
    this.braintreeCustomerService = new BraintreeCustomerService({ ctAPI: paymentSDK.ctAPI });
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
          ...this.existingTransactionActions(payment, response, transaction),
          // the placeholder of this type was just overwritten with this transaction
          ...(hasPlaceholder(payment, transaction.type)
            ? []
            : paymentSDK.ctPaymentService.consolidateTransactionChanges(payment, transaction)),
          // Braintree's real status can naturally map to something other than the CT Checkout override
          // (e.g. autocapture -> Charge). Record that too (same interactionId) so CT's amountPaid and
          // findActiveCharges (refund/reverse targets) see Braintree's actual state,
          // not just the Authorization entry above. The Failure check is defensive only: a declined sale throws in
          // common-connect's transactionSale before anything is written, so no Failure reaches here.
          ...(transactionTypeOverride &&
          mappedTransaction.type !== transactionTypeOverride &&
          mappedTransaction.state !== 'Failure'
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
   * The Express amount, shared by updateCartShipping and transactionSale so the amount approved is the amount charged.
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
   * - placeholder of this type (ACH micro-deposit, see transaction.utils.ts) → the real state and Braintree id
   * - Pending Charge or Refund of a voided transaction → Failure, since no settlement webhook will come and a voided
   *   refund never reached the customer (docs/Intents.md)
   */
  private existingTransactionActions(
    payment: Payment,
    response: Transaction,
    transaction: { type: TransactionType; state: TransactionState },
  ): PaymentUpdateAction[] {
    const isOwnPlaceholder = (t: Payment['transactions'][number]) => isPlaceholder(t, transaction.type);
    const isVoidedPending = (t: Payment['transactions'][number]) =>
      response.status === 'voided' &&
      (t.type === 'Charge' || t.type === 'Refund') &&
      t.state === 'Pending' &&
      t.interactionId === response.id;
    if (payment.transactions.some(isOwnPlaceholder) && hasCancelledPlaceholder(payment)) {
      logger.error(
        `${CONCURRENT_CANCEL_AND_SALE_ISSUE} on payment ${payment.id}, Braintree transaction ${response.id}`,
      );
    }
    return payment.transactions.flatMap((t): PaymentUpdateAction[] => {
      if (isOwnPlaceholder(t))
        return [
          { action: 'changeTransactionState', transactionId: t.id, state: transaction.state },
          { action: 'changeTransactionInteractionId', transactionId: t.id, interactionId: response.id },
        ];
      if (isVoidedPending(t)) return [{ action: 'changeTransactionState', transactionId: t.id, state: 'Failure' }];
      return [];
    });
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
   * Failed Braintree call → recorded on the payment ({messageName}Response + pspInteractions), logged as error,
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
    const message = `Braintree call failed: ${errorMessage(err)}`;
    const failure = { success: false, message };
    await this.recordResponse(ctPayment, messageName, request, failure, `${messageName}:failureRecord`, '');
    return this.rejectPaymentIntent(ctPayment.id, operation, message, 'error');
  }

  /**
   * Records a Braintree call that leaves no transaction on the payment ({messageName}Response + pspInteractions), in
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
        logger.warn(
          `getExpressClientToken: customer lookup failed for cart ${cartId}, issuing anonymous token — ${errorMessage(err)}`,
        );
      }
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
            logger.error(
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

      const { payment: reusedPayment, tokenRecentlyUpdated } = this.existingPaymentAndToken(
        // only this connector's payment is reused — the cart may hold other connectors' payments (e.g. gift cards)
        existingPayment && braintreePaymentTypeId && isBraintreePayment(existingPayment, braintreePaymentTypeId)
          ? existingPayment
          : undefined,
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
              customFields: withBraintreeType(handleCustomFieldResponse('getClientToken', clientToken), ctPayment),

              pspInteractions: buildPspInteractions(
                'getClientToken',
                { merchantAccountId, isPureVault, builderType, paymentMethodType }, // PURE_VAULT_DISABLED: unreachable
                clientToken,
              ),
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
        extendedLineItems.push(
          buildDiscountLineItem(
            mapCommercetoolsMoneyToBraintreeMoney(relevantDiscountAmount(ctCart.discountOnTotalPrice)),
          ),
        );
      }
      if (!isExpress && ctCart.shippingInfo) {
        const amount = mapCommercetoolsMoneyToBraintreeMoney(relevantShippingAmount(ctCart.shippingInfo));
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
    const cartId = this.requireCartIdFromContext();
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
          log.warn(`Could not set shipping method ${newShippingMethodId} for cart ${ctCart.id} — ${errorMessage(err)}`);
          return;
        });
      if (!updatedCard) {
        throw new ErrorInvalidOperation(
          `Could not set shipping method ${newShippingMethodId} for cart ${ctCart.id}. Cart not found in CoCo.`,
        );
      }
      // amountPlanned stays as createPayment set it (the checkout API doesn't support updating it); transactionSale
      // recomputes the charged amount from the refetched cart with the same expressCartAmount.
      const totalNum = toNum(await this.expressCartAmount(updatedCard));
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

      logger.info(`updateCartShipping: success, cartId: ${ctCart.id}`);
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
    // A session without a Cart (PayPal Express before the click) passes auth, but must never charge
    const cartId = this.requireCartIdFromContext(ctPaymentId);
    this.validateTransactionSaleParams(
      paymentMethodType,
      paymentMethodNonce,
      paymentToken,
      localPaymentId,
      venmoUsername,
    );
    if (paymentMethodType === PaymentMethodType.ACH && !deviceData)
      logger.warn(
        `transactionSale for payment ${ctPaymentId} has no deviceData (fraud device data collector failed, was blocked, or had not finished)`,
      );
    const [updatedExpress, ctPayment, braintreePaymentTypeId] = await Promise.all([
      braintreePaymentDetails?.expressShippingChanged
        ? this.ctCartService
            .getCart({ id: cartId })
            .then(async (cart) => cart && { cart, amountPlanned: await this.expressCartAmount(cart) })
        : Promise.resolve(undefined),
      this.ctPaymentService.getPayment({ id: ctPaymentId }),
      getBraintreePaymentTypeId(),
    ]);
    if (!ctPayment) {
      throw new ErrorInvalidOperation(`payment is missing for transactionSale payment ${ctPaymentId}}`);
    }
    if (!isBraintreePayment(ctPayment, braintreePaymentTypeId)) {
      logger.error(`transactionSale: ${notBraintreePaymentMessage(ctPaymentId)}`);
      throw new ErrorInvalidOperation(notBraintreePayment(ctPaymentId));
    }
    // Unverified ACH payment whose Order was cancelled before the micro-deposits were verified (cancelPlaceholderPayment)
    if (hasCancelledPlaceholder(ctPayment)) {
      throw new ErrorInvalidOperation(
        `transactionSale refused — payment ${ctPaymentId} was cancelled before verification`,
      );
    }
    if (!updatedExpress && braintreePaymentDetails?.expressShippingChanged)
      throw new ErrorInvalidOperation(`could not find updated cart for transactionsSale payment ${ctPaymentId}`);
    const updatedCart = updatedExpress?.cart;
    const relevantPaymentInfo = updatedExpress
      ? { ...ctPayment, amountPlanned: updatedExpress.amountPlanned }
      : ctPayment;
    const isPayPal = paymentMethodType === 'PayPal'; // PAYPAL_STORED_DISABLED: || paymentMethodType === 'PayPalStored'
    // After an Express shipping change, amount, line items and shipping come from the refetched cart, not the enabler's
    // createPayment copies, computed as in updateCartShipping (expressCartAmount), so they match what it sent to Braintree.
    const lineItems = (
      updatedCart
        ? updatedCart.lineItems.map((lineItem) => mapCTLineItemToBraintreeLineItem(lineItem, updatedCart.locale))
        : (braintreePaymentDetails?.braintreeLineItems ?? [])
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
    const discountResidual = lineItemsTotal + shippingAmountNum - toNum(relevantPaymentInfo.amountPlanned);
    if (discountResidual < -0.01) {
      log.warn(
        `transactionSale: lineItems total (${lineItemsTotal.toFixed(2)}) plus shipping (${shippingAmountNum.toFixed(2)}) is less than the charged amount (${toNum(relevantPaymentInfo.amountPlanned).toFixed(2)}) for payment ${ctPaymentId} — discountAmount clamped to 0, check for missing external tax/fees`,
      );
    }
    const { fractionDigits } = relevantPaymentInfo.amountPlanned;
    const residualDiscount = Math.max(0, discountResidual).toFixed(fractionDigits);
    // PayPal declines a sale whose discount is sent as discountAmount instead of a DISCOUNT credit line item
    // (the form the PayPal order was created with). The credit item is rebuilt from the residual rather than
    // echoed from createPayment, since the cart discount can change after a shipping update.
    const sendDiscountAsLineItem = isPayPal && Number(residualDiscount) > 0;
    if (sendDiscountAsLineItem) lineItems.push(buildDiscountLineItem(residualDiscount));
    const discountAmount = sendDiscountAsLineItem ? (0).toFixed(fractionDigits) : residualDiscount;
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
      ...(braintreePaymentDetails?.expressShippingChanged
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
      // Braintree's message is logged above, not sent back: this message reaches the browser.
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
    logger.info(`transactionSale: success, paymentId: ${ctPaymentId}`);
    return this.paymentActionSuccessResponse(ctPayment.id, undefined, venmoUsername);
  }

  // see docs/Intents.md "Capture"; see also extension module submitForSettlement
  public async settlement(request: ModifyPaymentWithTransactionRequest): Promise<PaymentIntentResponseSchemaDTO> {
    const { payment: ctPayment, amount, merchantReference } = request;
    // the Authorization given as merchantReference, otherwise the last one. merchantReference is used as a Braintree id
    // because capturePayment has no transactionId — see docs/Intents.md "Call parameters"
    // (https://docs.commercetools.com/checkout/payment-intents-api)
    const transactionId = merchantReference ?? findTransactionIdOrUndefined(ctPayment, 'Authorization');
    if (!transactionId)
      return this.rejectPaymentIntent(ctPayment.id, 'settlement', 'no transaction suitable for settlement');
    const authorization = withoutPlaceholders(ctPayment).transactions.find(
      (t) => t.type === 'Authorization' && t.interactionId === transactionId,
    );
    if (!authorization)
      return this.rejectPaymentIntent(
        ctPayment.id,
        'settlement',
        `transaction ${transactionId} isn't an Authorization of the payment`,
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
    logger.info(`settlement: success, paymentId: ${ctPayment.id}`);
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
    let response: Transaction;
    try {
      response = await braintreeRefund(relevantTransactionId, braintreeAmount);
    } catch (err) {
      return await this.handleBraintreeFailure({
        ctPayment,
        operation,
        messageName: 'refund',
        request: { relevantTransactionId, amount },
        err,
      });
    }
    // CT sync — Braintree already refunded; awaited (retryCTSync never throws), no notifications fallback
    await this.updatePaymentWithTransaction({
      messageName: 'refund',
      request: { relevantTransactionId, amount },
      ctPayment,
      response,
      methodName: operation,
    });
    logger.info(`${operation}: refund success, paymentId: ${ctPayment.id}`);
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
    logger.info(`${operation}: void success, paymentId: ${ctPayment.id}`);
    return this.toPaymentIntentResponse(response);
  }

  /**
   * Cancel of an unverified ACH payment (micro-deposit flow) with no Braintree transaction yet — writes the cancel
   * marker; see docs/Intents.md "ACH micro-deposit verification".
   */
  private async cancelPlaceholderPayment(
    ctPayment: Payment,
    operation: string,
  ): Promise<PaymentIntentResponseSchemaDTO> {
    const cancelled = await retryCTSync(
      async () => {
        const payment = await this.ctPaymentService.getPayment({ id: ctPayment.id });
        if (hasCancelledPlaceholder(payment)) return;
        const placeholder = payment.transactions.find((t) => isPlaceholder(t, 'Authorization'));
        if (!placeholder) {
          logger.error(`${CONCURRENT_CANCEL_AND_SALE_ISSUE} on payment ${ctPayment.id}`);
        }
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
    if (!cancelled)
      return this.rejectPaymentIntent(
        ctPayment.id,
        operation,
        'cancellation could not be recorded on commercetools',
        'error',
      );
    logger.warn(
      `${operation}: ACH payment cancelled before micro-deposit verification, no Braintree transaction exists — the bank account stays vaulted, paymentId: ${ctPayment.id}. Cancelled commercetools transaction placeholder added to avoid accidental Braintree capture in the future.`,
    );
    return { outcome: PaymentModificationStatus.APPROVED };
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
    if (hasPlaceholder(ctPayment)) return this.cancelPlaceholderPayment(ctPayment, operation);
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
    if (givenId) {
      if (withoutPlaceholders(ctPayment).transactions.some((t) => t.interactionId === givenId))
        return { transactionId: givenId };
      return {
        rejected: this.rejectPaymentIntent(
          ctPayment.id,
          operation,
          `transaction ${givenId} doesn't belong to the payment`,
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
    logFrontendIssue,
  }: AchVaultTokenRequestSchemaDTO): Promise<AchVaultTokenResponseSchemaDTO> {
    // A session without a Cart (PayPal Express before the click) passes auth, but must never vault
    const cartId = this.requireCartIdFromContext(ctPaymentId);
    if (logFrontendIssue)
      logger.warn(
        `getAchVaultToken: frontend issue reported on payment ${ctPaymentId} before this attempt: ${logFrontendIssue}`,
      );
    // Payment and type are read in parallel with the vault, so a payment without the Braintree type can't be refused
    // before Braintree. A failed read must not fail the vault: the type then isn't checked, and syncPayment fetches.
    const [{ token, verified }, braintreePaymentTypeId, ctPayment] = await Promise.all([
      this.braintreeCustomerService.vaultPaymentMethodForCustomer({
        paymentMethodNonce,
        braintreeCustomerId,
        ctCustomerId,
      }),
      getBraintreePaymentTypeId().catch(() => undefined),
      this.ctPaymentService.getPayment({ id: ctPaymentId }).catch(() => undefined),
    ]);

    // Symmetric with linkBraintreeCustomerId (called inside vaultPaymentMethodForCustomer): also register
    // the vaulted method in commercetools' own PaymentMethod resource. Best-effort — Braintree's vault
    // above already succeeded and remains authoritative; see the class-level note in abstract-payment.service.ts.
    // ctPaymentMethodService requires the CT customer id, which may not be the request body's optional
    // ctCustomerId (that field can be omitted when the caller only supplied an existing braintreeCustomerId),
    // so it's resolved from cart context instead, same as getStoredPaymentMethods/deleteStoredPaymentMethod.
    // Fire-and-forget end-to-end so the cart lookup doesn't add latency to the vault-token response.
    this.fireAndForgetCtPaymentMethodSync(async () => {
      const ctCartForVault = await this.ctCartService.getCart({ id: cartId });
      if (!ctCartForVault.customerId) return;
      return this.ctPaymentMethodService.save({
        customerId: ctCartForVault.customerId,
        method: PaymentMethodType.ACH,
        paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
        token,
      });
    }, `getAchVaultToken: could not save commercetools PaymentMethod record for payment ${ctPaymentId}`);

    if (!verified) {
      // The placeholder write needs no custom type, so it still goes ahead; the merchant is told to resolve the type.
      if (ctPayment && braintreePaymentTypeId && !isBraintreePayment(ctPayment, braintreePaymentTypeId))
        logger.error(
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
          ...addPlaceholderActions(payment),
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
    const ctCart = await this.ctCartService.getCart({ id: this.requireCartIdFromContext() });
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
    const cartId = this.requireCartIdFromContext();
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
