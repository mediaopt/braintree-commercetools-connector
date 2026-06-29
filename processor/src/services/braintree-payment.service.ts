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
import { ShippingMethod, CentPrecisionMoney, PaymentMethodInfoDraft } from '@commercetools/platform-sdk';
import { Transaction } from 'braintree';

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
} from '../dtos/braintree-payment.dto';
import { StoredPaymentMethodsResponse } from '../dtos/stored-payment-methods.dto';
import { getCartIdFromContext, getMerchantReturnUrlFromContext } from '../libs/fastify/context/context';
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

import { LineItemKind, mapCTLineItemToBraintreeLineItem } from '../utils/lineItem.utils';
import {
  mapCTShippingToBraintreeShipping,
  mapShippingMethodsToBraintreeShippingOptions,
} from '../utils/shipping.utils';
import { BraintreeCustomerService } from './braintree-customer.service';

const CT_SYNC_MAX_ATTEMPTS = 3;
const CT_SYNC_BACKOFF_BASE_MS = 500;

async function retryCTSync(
  fn: () => Promise<void>,
  methodName: string,
  paymentId: string,
  maxAttempts = CT_SYNC_MAX_ATTEMPTS,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      if (attempt > 1) logger.info(`${methodName}: CT sync succeeded on retry ${attempt}, paymentId: ${paymentId}`);
      return;
    } catch (err) {
      logger.error(
        `${methodName}: CT sync failed (attempt ${attempt}/${maxAttempts}), paymentId: ${paymentId} — ${err instanceof Error ? err.message : err}`,
      );
      const status = (err as { httpErrorStatus?: number })?.httpErrorStatus;
      if (status === 401 || status === 403) {
        logger.warn(`${methodName}: CT sync skipping retry (status ${status}), paymentId: ${paymentId}`);
        return;
      }
      if (status === 404) {
        logger.error(
          `${methodName}: CT payment not found after Braintree operation completed (status 404), paymentId: ${paymentId} — CT state is permanently inconsistent`,
        );
        return;
      }
      if (attempt < maxAttempts)
        await new Promise((resolve) => setTimeout(resolve, CT_SYNC_BACKOFF_BASE_MS * 2 ** (attempt - 1)));
    }
  }
}

const lineItemPlaceholders = {
  quantity: '1',
  unitTaxAmount: '0.00',
  description: '',
  url: '',
  commodityCode: '',
  discountAmount: '',
  taxAmount: '',
  unitOfMeasure: 'unit' as const,
};

export class BraintreePaymentService extends AbstractPaymentService {
  private braintreeCustomerService: BraintreeCustomerService;

  constructor(opts: BraintreePaymentServiceOptions) {
    super(opts.ctCartService, opts.ctPaymentService);
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
    paymentMethodInfo,
  }: {
    messageName: string;
    request: string | object;
    ctPayment: Payment;
    response: Transaction;
    customFields?: CustomFieldsDraft;
    paymentMethodInfo?: PaymentMethodInfoDraft;
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
    await this.ctPaymentService.updatePayment({
      id: ctPayment.id,
      customFields,
      pspInteractions: [requestInteraction, responseInteraction],
      transaction: mapBraintreeTransactionToCommercetoolsTransaction(ctPayment, response),
      pspReference: response.id,
      paymentMethodInfo,
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
    const config = getConfig();

    return {
      returnUrl: config.returnUrl,
      environment: config.braintreeEnvironment,
      storedPaymentMethodsConfig: {
        isEnabled: await this.isStoredPaymentMethodsEnabled(),
      },
      enableVaulting: config.enableVaulting,
      buttonStyleOverrides: config.buttonStyleOverrides,
      perMethodConfig: config.perMethodConfig,
    };
  }

  // Displaying the Venmo username in the checkout UI is the merchant's responsibility.
  // After a successful Venmo payment, venmoUsername is appended to the merchantReturnUrl
  // as a query parameter. The merchant's return page should read this value from the URL.
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
    const localComponents = hasMerchantAccount ? Object.values(LocalPaymentMethodType).map((type) => ({ type })) : [];
    return {
      dropins: [],
      components: [
        { type: PaymentMethodType.ACH },
        { type: PaymentMethodType.APPLE_PAY },
        { type: PaymentMethodType.CREDIT_CARD },
        { type: PaymentMethodType.GOOGLE_PAY },
        { type: PaymentMethodType.PAYPAL },
        { type: PaymentMethodType.VENMO },
        ...localComponents,
      ],
      express: [
        { type: PaymentMethodType.PAYPAL },
        // PURE_VAULT_DISABLED: { type: PaymentMethodType.PAYPAL_VAULT },
        // PURE_VAULT_DISABLED: { type: PaymentMethodType.CREDIT_CARD_VAULT },
      ],
    };
  }

  public async getShippingMethods(ctCartId: string): Promise<ShippingMethod[] | void> {
    return await paymentSDK.ctAPI.client
      .shippingMethods()
      .matchingCart()
      .get({ queryArgs: { cartId: ctCartId, expand: 'zoneRates[*].zone' } })
      .execute()
      .then((response) => response.body.results)
      .catch((err) => {
        log.warn(`No shipping available for ${ctCartId}`, { error: err });
        return;
      });
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
      this.validateCartRequiredData(ctCart, isPureVault); // PURE_VAULT_DISABLED: unreachable

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
              paymentMethodInfo: { paymentInterface: getConfig().paymentInterface }, //todo - check if a more relevant interface exists
              ...customerPaymentInfo,
              paymentStatus: { interfaceCode: 'Initial', interfaceText: 'Initial' },
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
      logger.error(
        `createPayment: failed, cartId: ${cartId ?? 'unavailable'} — ${err instanceof Error ? err.message : err}`,
      );
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
        braintreeAmount: Number(mapCommercetoolsMoneyToBraintreeMoney(ctPayment.amountPlanned)),
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
  }: {
    newShippingMethodId: string;
  }): Promise<UpdateCartShippingResponseSchemaDTO> {
    const cartId = getCartIdFromContext();
    try {
      const ctCart = await this.ctCartService.getCart({
        id: cartId,
      });
      const updatedCard = await paymentSDK.ctAPI.client
        .carts()
        .withId({ ID: ctCart.id })
        .post({
          body: {
            version: ctCart.version,
            actions: [
              {
                action: 'setShippingMethod',
                shippingMethod: {
                  id: newShippingMethodId,
                  typeId: 'shipping-method',
                },
              },
            ],
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
      const totalNum = Number(mapCommercetoolsMoneyToBraintreeMoney(costWithNewShipping as CentPrecisionMoney));
      const shippingNum = updatedCard.shippingInfo?.price
        ? Number(mapCommercetoolsMoneyToBraintreeMoney(updatedCard.shippingInfo.price))
        : 0;
      const discountNum = updatedCard.discountOnTotalPrice?.discountedAmount
        ? Number(mapCommercetoolsMoneyToBraintreeMoney(updatedCard.discountOnTotalPrice.discountedAmount))
        : 0;
      // taxTotal must be mapped separately only for external tax modes (External / ExternalAmount);
      // for Platform/Disabled the tax is already embedded in line item prices.
      const isExternalTax = updatedCard.taxMode === 'External' || updatedCard.taxMode === 'ExternalAmount';
      const taxNum =
        isExternalTax && updatedCard.taxedPrice?.totalTax
          ? Number(mapCommercetoolsMoneyToBraintreeMoney(updatedCard.taxedPrice.totalTax))
          : 0;

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
      logger.error(
        `updateCartShipping: failed, cartId: ${cartId ?? 'unavailable'} — ${err instanceof Error ? err.message : err}`,
      );
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
    braintreePaymentDetails,
    localPaymentId,
    venmoUsername,
  }: TransactionSaleRequestSchemaDTO): Promise<PaymentUpdateResponseSchemaDTO> {
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
    // new customer only: tell Braintree to create with id = CT customer id
    const optionalRequestData =
      storeInVaultOnSuccess && ctPayment.customer?.id && !braintreeCustomerId
        ? { customer: { id: ctPayment.customer.id } }
        : undefined;
    const transactionRequest = mapRequestToBraintreeTransactionSale(
      relevantPaymentInfo,
      storeInVaultOnSuccess,
      storeShipping,
      paymentMethodNonce,
      paymentToken,
      optionalRequestData,
    );
    // braintree has 35 char limit for line item name in transactionSale, see https://developers.braintreepayments.com/reference/request/transaction/sale/node#line_items-name
    const lineItemsForSale = (braintreePaymentDetails?.braintreeLineItems || []).map((item) => ({
      ...item,
      name: item.name.substring(0, 35),
    })); //braintree has 35 char limit for line item name in transactionSale, so we need to cut it to avoid errors, see https://developers.braintreepayments.com/reference/request/transaction/sale/node#line_items-name
    transactionRequest.lineItems = lineItemsForSale.filter(({ productCode }) => productCode !== 'DISCOUNT');
    transactionRequest.discountAmount = mapCommercetoolsMoneyToBraintreeMoney(
      updatedCart?.discountOnTotalPrice?.discountedAmount || { ...ctPayment.amountPlanned, centAmount: 0 },
    );
    if (braintreePaymentDetails?.extraShippingCost) {
      //will be only submitted in express mode, then shipping was submitted via SDK through update and can be mapped here, otherwise it is included in line items
      transactionRequest.shippingAmount = Number(braintreePaymentDetails.extraShippingCost).toFixed(2);
    } //see enabler PayPalMask onShippingChange and onApprove
    if (localPaymentId) {
      if (!transactionRequest.options) transactionRequest.options = {};
      transactionRequest.options.submitForSettlement = true; //required for local payment methods
    }
    let response!: Transaction;
    try {
      response = await transactionSale(transactionRequest); //todo - test discount and external tax
    } catch (e) {
      logger.error(
        `transactionSale: Braintree call failed, paymentId: ${ctPaymentId} — ${e instanceof Error ? e.message : JSON.stringify(e)}`,
      );
      throw new ErrorInvalidOperation(
        `transactionSale failed for payment ${ctPaymentId} with error ${e instanceof Error ? e.message : JSON.stringify(e)}`,
      );
    }
    if (localPaymentId) {
      const saleLocalPaymentId = (response as TransactionWithLocalPayment).localPayment?.paymentId;
      if (saleLocalPaymentId && localPaymentId !== saleLocalPaymentId) {
        logger.warn(
          `localPaymentId mismatch for payment ${ctPaymentId}. Enabler sent: ${localPaymentId}, Braintree returned: ${saleLocalPaymentId}`,
        );
      }
    }
    const customFields = handleCustomFieldResponse('transactionSale', response);
    handleCustomTransactionFields(customFields, response, ctPayment);
    // Fire-and-forget: customer update has no webhook fallback, so retries are handled
    // internally in linkBraintreeCustomerId, but it does not block the transaction response.
    if (storeInVaultOnSuccess && response.customer?.id && ctPayment.customer?.id) {
      void this.braintreeCustomerService.linkBraintreeCustomerId(ctPayment.customer.id, response.customer.id);
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
      });
    void retryCTSync(ctSyncFn, 'transactionSale', ctPaymentId, localPaymentId ? 1 : undefined);
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
      logger.error(
        `settlement: Braintree call failed, paymentId: ${ctPayment.id} — ${err instanceof Error ? err.message : err}`,
      );
      throw new ErrorGeneral(
        `settlement failed for payment ${ctPayment.id} with error ${err instanceof Error ? err.message : JSON.stringify(err)}`,
      );
    }
    // CT sync — Braintree already settled; retry async, no notifications fallback for this operation type
    const paymentMethodHint = getPaymentMethodHint(response);
    void retryCTSync(
      () =>
        this.updatePaymentWithTransaction({
          messageName: 'submitForSettlement',
          request: request,
          ctPayment,
          response,
          paymentMethodInfo: { method: `${response.paymentInstrumentType} ${paymentMethodHint || ''}`.trim() },
          //todo - find out what are the alternatives for status interface code and text
        }),
      'settlement',
      ctPayment.id,
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
      logger.error(
        `refundPayment: Braintree call failed, paymentId: ${ctPayment.id} — ${err instanceof Error ? err.message : err}`,
      );
      throw new ErrorGeneral(
        `refundPayment failed for payment ${ctPayment.id} with error ${err instanceof Error ? err.message : JSON.stringify(err)}`,
      );
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
      logger.error(
        `void: Braintree call failed, paymentId: ${ctPayment.id} — ${err instanceof Error ? err.message : err}`,
      );
      throw new ErrorGeneral(
        `void failed for payment ${ctPayment.id} with error ${err instanceof Error ? err.message : JSON.stringify(err)}`,
      );
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
      const creditCards = (btCustomer.creditCards ?? []).map((cc) => ({
        id: cc.token,
        type: 'CreditCard',
        token: cc.token,
        isDefault: cc.default ?? false,
        createdAt: cc.createdAt,
        displayOptions: {
          endDigits: cc.last4,
          brand: cc.cardType ? { key: cc.cardType } : undefined,
          expiryMonth: cc.expirationMonth ? parseInt(cc.expirationMonth, 10) : undefined,
          expiryYear: cc.expirationYear ? parseInt(cc.expirationYear, 10) : undefined,
        },
      }));
      const paypalAccounts = (btCustomer.paypalAccounts ?? []).map((pp) => ({
        id: pp.token,
        type: 'PayPal',
        token: pp.token,
        isDefault: pp.default ?? false,
        createdAt: pp.createdAt,
        displayOptions: { email: pp.email },
      }));
      //reason - ACH is supported by SDK but not documented in typescript
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usBankAccounts = ((btCustomer as any).usBankAccounts ?? []).map((ba: any) => ({
        id: ba.token,
        type: 'UsBankAccount',
        token: ba.token,
        isDefault: ba.default ?? false,
        createdAt: ba.createdAt,
        displayOptions: {
          endDigits: ba.last4,
          brand: ba.accountType ? { key: ba.accountType } : undefined,
        },
      }));
      logger.info(
        `getStoredPaymentMethods: customer ${braintreeCustomerId} — creditCards: ${creditCards.length}, paypalAccounts: ${paypalAccounts.length}, usBankAccounts: ${usBankAccounts.length}`,
      );
      if (!creditCards.length && !paypalAccounts.length && !usBankAccounts.length) {
        logger.warn(`No stored payment methods returned by Braintree for customer ${braintreeCustomerId}`);
      }
      return { storedPaymentMethods: [...creditCards, ...paypalAccounts, ...usBankAccounts] };
    } catch (e) {
      logger.warn(`Could not find Braintree customer ${braintreeCustomerId}: ${e instanceof Error ? e.message : e}`);
      return { storedPaymentMethods: [] };
    }
  }

  public async deleteStoredPaymentMethod(token: string): Promise<void> {
    const cartId = getCartIdFromContext();
    try {
      const [, ctCart] = await Promise.all([
        braintreeDeletePayment(token),
        this.ctCartService.getCart({ id: cartId }).catch(() => undefined), // depersonalized log context only — not required for the delete
      ]);
      logger.info(`deleteStoredPaymentMethod: success, cartId: ${ctCart?.id ?? 'unavailable'}`);
    } catch (err) {
      logger.error(
        `deleteStoredPaymentMethod: failed, cartId: ${cartId ?? 'unavailable'} — ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
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

  private validateCartRequiredData(ctCart: Cart, isPureVault?: boolean): void {
    if (isPureVault) return;
    if (!ctCart.customerEmail || !ctCart.billingAddress || !ctCart.shippingAddress)
      throw new ErrorInvalidOperation('Required data missing: email or address');
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
