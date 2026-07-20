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

// localPayment is an undocumented field Braintree adds to Transaction for local payment methods
// See: https://developer.paypal.com/braintree/docs/guides/local-payment-methods/client-side/javascript/v3
type TransactionWithLocalPayment = Transaction & {
  localPayment?: { paymentId?: string };
};

import {
  CancelPaymentRequest,
  ConfigResponse,
  ModifyPaymentWithTransactionRequest,
  StatusResponse,
} from './types/operation.type';

import { SupportedPaymentComponentsSchemaDTO } from '../dtos/operations/payment-componets.dto';
import packageJSON from '../../package.json';

import { AbstractPaymentService } from './abstract-payment.service';
import { getConfig } from '../config/config';
import { appLogger, paymentSDK } from '../payment-sdk';
import { BraintreePaymentServiceOptions } from './types/braintree-payment.type';
import {
  PaymentUpdateResponseSchemaDTO,
  PaymentMethodType,
  LocalPaymentMethodType,
  PaymentOutcome,
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
  submitForSettlement,
  getPaymentMethodHint,
  refund as braintreeRefund,
  voidTransaction as braintreeVoidTransaction,
  findSuitableTransactionId,
  deletePayment as braintreeDeletePayment,
  getCurrentTimestamp,
  logger,
} from 'common-connect/dist';
import { handleCustomTransactionFields, handleCustomFieldResponse } from '../utils/customEntities.utils';

import { LineItemKind, mapCTLineItemToBraintreeLineItem, lineItemPlaceholders } from '../utils/lineItem.utils';
import { toNum, toMoneyStr } from '../utils/money.utils';
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
import { BraintreeCustomerService } from './braintree-customer.service';

// Initial transaction required for checkout API to ensure the proper order creation.
const OPTIMISTIC_TRANSACTION_TRIGGER_ORDER: TransactionState = 'Initial';

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
    await this.ctPaymentService.updatePayment({
      id: ctPayment.id,
      customFields,
      pspInteractions: [requestInteraction, responseInteraction],
      transaction: transactionTypeOverride
        ? { ...mappedTransaction, type: transactionTypeOverride }
        : mappedTransaction,
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
   * Records a placeholder Authorization transaction before the Braintree sale is attempted (see
   * OPTIMISTIC_TRANSACTION_TRIGGER_ORDER). Awaited, not fire-and-forget, so it's always committed
   * before the real transaction — errors are caught and logged internally, never thrown, so a
   * failure here never blocks the actual charge. Idempotent. Raw API call: ctPaymentService.updatePayment
   * silently discards an 'Initial' transaction with no interactionId.
   */
  private async recordOptimisticAuthorizationPlaceholder(
    ctPayment: Payment,
    amountPlanned: CentPrecisionMoney,
  ): Promise<void> {
    try {
      const hasPlaceholder = ctPayment.transactions.some(
        (transaction) => transaction.type === 'Authorization' && !transaction.interactionId,
      );
      if (hasPlaceholder) return;
      await paymentSDK.ctAPI.client
        .payments()
        .withId({ ID: ctPayment.id })
        .post({
          body: {
            version: ctPayment.version,
            actions: [
              {
                action: 'addTransaction',
                transaction: {
                  type: 'Authorization',
                  state: OPTIMISTIC_TRANSACTION_TRIGGER_ORDER,
                  amount: { centAmount: amountPlanned.centAmount, currencyCode: amountPlanned.currencyCode },
                },
              },
            ],
          },
        })
        .execute();
    } catch (e) {
      logger.warn(
        `transactionSale: could not record optimistic Authorization placeholder for payment ${ctPayment.id} — ${errorMessage(e)}`,
      );
    }
  }

  /**
   * Applies setStatusInterfaceCode/setStatusInterfaceText/setMethodInfoMethod via a raw CT API call
   * (not supported by the CT Checkout SDK), optionally ensuring a placeholder transaction exists.
   * Re-fetches the payment version on every call so retries avoid version-conflict failures;
   * callers are expected to wrap this in retryCTSync themselves.
   *
   * `ensureTransaction` is idempotent across retries: it only adds the transaction if the payment
   * doesn't already have one of the same type/state with no interactionId (i.e. a prior attempt of
   * this same placeholder). This guards against retryCTSync re-adding it if a prior attempt
   * succeeded server-side but the client observed a transient failure — addTransaction itself has
   * no dedup key.
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
    const hasPlaceholder =
      ensureTransaction &&
      payment.transactions.some(
        (transaction) =>
          transaction.type === ensureTransaction.type &&
          transaction.state === ensureTransaction.state &&
          !transaction.interactionId,
      );
    const extraActions: PaymentUpdateAction[] =
      ensureTransaction && !hasPlaceholder
        ? [
            {
              action: 'addTransaction',
              transaction: {
                type: ensureTransaction.type,
                state: ensureTransaction.state,
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
    // ACH requires vaulting to a customer account — only available for logged-in sessions.
    // This route is JWT-authenticated; getCartIdFromContext() returns undefined for JWT auth
    // (it only extracts cartId from SessionAuthentication). Guard before fetching.
    const cartId = getCartIdFromContext();
    const achComponents =
      cartId && (await this.ctCartService.getCart({ id: cartId })).customerId
        ? [{ type: toPaymentMethodIconKey(PaymentMethodType.ACH) }]
        : [];
    return {
      dropins: [],
      components: [
        ...achComponents,
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
          logger.warn(`getShippingMethods: no shipping available for cart ${ctCartId}`, { error: err });
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
    if (!updatedCart && braintreePaymentDetails?.extraShippingCost)
      throw new ErrorInvalidOperation(`could not find updated cart for transactionsSale payment ${ctPaymentId}`);
    const relevantPaymentInfo = updatedCart ? { ...ctPayment, amountPlanned: updatedCart.totalPrice } : ctPayment;
    await this.recordOptimisticAuthorizationPlaceholder(ctPayment, relevantPaymentInfo.amountPlanned);
    // Braintree has 35-char limit for line item names — see https://developers.braintreepayments.com/reference/request/transaction/sale/node#line_items-name
    // Braintree rejects zero-amount line items for non-PayPal methods; for PayPal, zero amounts are explicitly allowed
    const isPayPal = paymentMethodType === 'PayPal'; // PAYPAL_STORED_DISABLED: || paymentMethodType === 'PayPalStored'
    const lineItems = (braintreePaymentDetails?.braintreeLineItems ?? [])
      .map((item) => ({ ...item, name: item.name.substring(0, 35) }))
      .filter(({ productCode, unitAmount }) => productCode !== 'DISCOUNT' && (isPayPal || Number(unitAmount) > 0));
    const optionalRequestData: Partial<TransactionRequest> = {
      ...(storeInVaultOnSuccess && ctPayment.customer?.id && !braintreeCustomerId
        ? { customer: { id: ctPayment.customer.id } }
        : {}),
      lineItems,
      discountAmount: toMoneyStr(updatedCart?.discountOnTotalPrice?.discountedAmount, ctPayment.amountPlanned),
      ...(braintreePaymentDetails?.extraShippingCost
        ? {
            shippingAmount: Number(braintreePaymentDetails.extraShippingCost).toFixed(
              ctPayment.amountPlanned.fractionDigits,
            ),
          } //will be only submitted in express mode, then shipping was submitted via SDK through update and can be mapped here, otherwise it is included in line items
        : {}), //see enabler PayPalMask onShippingChange and onApprove
      ...(deviceData ? { deviceData } : {}),
      ...(braintreePaymentDetails?.braintreeShipping ? { shipping: braintreePaymentDetails.braintreeShipping } : {}),
    };
    const transactionRequest = mapRequestToBraintreeTransactionSale(
      relevantPaymentInfo,
      storeInVaultOnSuccess,
      storeShipping,
      paymentMethodNonce,
      paymentToken,
      optionalRequestData,
    );
    // options.submitForSettlement cannot go into optionalRequestData — the mapper's outer spread would replace
    // the entire options object with just { submitForSettlement: true }, losing storeInVaultOnSuccess etc.
    if (localPaymentId || getConfig().autoCapture) {
      transactionRequest.options!.submitForSettlement = true;
    }
    let response!: Transaction;
    try {
      response = await transactionSale(transactionRequest); //todo - test discount and external tax
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
    // CT sync — Braintree already processed; local payments have a notifications fallback
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
    void retryCTSync(
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
  public async settlement(request: ModifyPaymentWithTransactionRequest): Promise<PaymentUpdateResponseSchemaDTO> {
    const { payment: ctPayment, amount } = request;
    const targetTransactions = ctPayment.transactions.filter(({ type }) => type === 'Authorization');
    if (!targetTransactions.length)
      throw new ErrorInvalidOperation(
        `Payment ${ctPayment.id} doesn't have a transaction with a type suitable for settlement`,
      );
    const relevantTransaction = targetTransactions[targetTransactions.length - 1];
    if (!relevantTransaction.interactionId)
      throw new ErrorRequiredField('interactionId', {
        privateMessage: `missing required field for Braintree submit for settlement - interactionId`,
      });
    const braintreeAmount = mapCommercetoolsMoneyToBraintreeMoney({ ...ctPayment.amountPlanned, ...amount });
    let response!: Transaction;
    try {
      response = await submitForSettlement(relevantTransaction.interactionId, braintreeAmount);
    } catch (err) {
      logger.error(`settlement: Braintree call failed, paymentId: ${ctPayment.id} — ${errorMessage(err)}`);
      throw new ErrorGeneral(`settlement failed for payment ${ctPayment.id} with error ${errorMessage(err)}`);
    }
    // CT sync — Braintree already settled; retry async, no notifications fallback for this operation type
    void retryCTSync(
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
    return this.paymentActionSuccessResponse(ctPayment.id);
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
   * @returns PaymentUpdateResponseSchemaDTO
   */
  async refundPayment(request: ModifyPaymentWithTransactionRequest): Promise<PaymentUpdateResponseSchemaDTO> {
    const relevantTransactionId =
      request.transactionId || findSuitableTransactionId({ payment: request.payment }, 'Charge');
    const { payment: ctPayment, amount } = request;
    if (!relevantTransactionId) {
      throw new ErrorInvalidOperation(
        `No suitable for refund transaction found for payment ${ctPayment.id}. Target transaction id: ${relevantTransactionId}`,
      );
    }
    const braintreeAmount = mapCommercetoolsMoneyToBraintreeMoney({ ...ctPayment.amountPlanned, ...amount });
    let response!: Transaction;
    try {
      response = await braintreeRefund(relevantTransactionId, braintreeAmount);
    } catch (err) {
      logger.error(`refundPayment: Braintree call failed, paymentId: ${ctPayment.id} — ${errorMessage(err)}`);
      throw new ErrorGeneral(`refundPayment failed for payment ${ctPayment.id} with error ${errorMessage(err)}`);
    }
    // CT sync — Braintree already refunded; retry async, no notifications fallback for this operation type
    const customFields = handleCustomFieldResponse('refund', response);
    void retryCTSync(
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
    return this.paymentActionSuccessResponse(ctPayment.id);
  }

  async void(request: CancelPaymentRequest): Promise<PaymentUpdateResponseSchemaDTO> {
    const { payment: ctPayment } = request;
    const transactionId = findSuitableTransactionId({ payment: ctPayment }, 'Authorization');
    if (!transactionId) {
      throw new ErrorInvalidOperation(
        `No suitable for void transaction found for payment ${ctPayment.id}. Target transaction id: ${transactionId}`,
      );
    }
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
    // CT sync — Braintree already voided; retry async, no notifications fallback for this operation type
    const customFields = handleCustomFieldResponse('void', response);
    void retryCTSync(
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
    return this.paymentActionSuccessResponse(ctPayment.id);
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
   *    business days. CT payment is synced to Pending here so the merchant's order management
   *    reflects the intent. The enabler redirects to the result page immediately using the
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
      void retryCTSync(
        () =>
          this.syncCtPaymentStatus({
            ctPaymentId,
            // interfaceText follows the project convention: short Braintree status string
            // (same as response.status used in updatePaymentWithTransaction and
            // common-connect/src/utils/response.utils.ts)
            interfaceCode: 'settlement_pending',
            interfaceText: 'settlement_pending',
            method: 'us_bank_account',
            ensureTransaction: { type: 'Authorization', state: OPTIMISTIC_TRANSACTION_TRIGGER_ORDER },
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
      // payment methods here. This may be requested by customers in future; please open an issue
      // if you are interested.
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
      // Braintree is the priority/authoritative source here — see the class-level note in
      // abstract-payment.service.ts for why: this connector vaulted directly against Braintree before
      // commercetools-native PaymentMethod tracking existed, so older stored methods may have no CT
      // counterpart. We still cross-check against commercetools and log a warning on drift, without
      // changing what's returned, so the two stores' divergence is visible rather than silent.
      // Only credit cards are compared — PayPal vaulting is disabled (legacy Braintree-side PayPal
      // accounts would never have a CT counterpart and would permanently false-positive) and ACH
      // isn't offered as a stored payment method to the enabler at all.
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

  private convertPaymentResultCode(resultCode: PaymentOutcome): string {
    switch (resultCode) {
      case PaymentOutcome.AUTHORIZED:
        return 'Success';
      case PaymentOutcome.REJECTED:
        return 'Failure';
      default:
        return 'Initial';
    }
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
