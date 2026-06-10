import {
  statusHandler,
  healthCheckCommercetoolsPermissions,
  ErrorRequiredField,
  ErrorInvalidOperation,
  Cart,
  Customer,
  Payment,
  CustomFieldsDraft,
} from '@commercetools/connect-payments-sdk';

import { CustomerResourceIdentifier } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/customer';
import { ShippingMethod, CentPrecisionMoney, PaymentMethodInfoDraft, CustomFields } from '@commercetools/platform-sdk';
import { Transaction } from 'braintree';

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
  PaymentOutcome,
  PaymentRequestSchemaDTO,
  PaymentResponseSchemaDTO,
  PureVaultRequestSchemaDTO,
  TransactionSaleRequestSchemaDTO,
  UpdateCartShippingResponseSchemaDTO,
} from '../dtos/braintree-payment.dto';
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
import { successGeneralResponse } from './constants';

const TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

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
    };
  }

  private buildRedirectMerchantUrl(paymentReference: string, paymentStatus?: string): string | undefined {
    const merchantReturnUrl = getMerchantReturnUrlFromContext() || getConfig().returnUrl;
    if (!merchantReturnUrl?.length) return undefined;
    const redirectUrl = new URL(merchantReturnUrl);

    redirectUrl.searchParams.append('paymentReference', paymentReference);
    if (paymentStatus) {
      redirectUrl.searchParams.append('paymentStatus', 'paymentStatus');
    }
    return redirectUrl.toString();
  }

  private paymentActionSuccessResponse(
    paymentReference: string,
    paymentStatus?: string,
  ): PaymentUpdateResponseSchemaDTO {
    return {
      ...successGeneralResponse,
      paymentReference,
      merchantReturnUrl: this.buildRedirectMerchantUrl(paymentReference, paymentStatus),
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
    return {
      dropins: [],
      components: [
        { type: PaymentMethodType.ACH },
        { type: PaymentMethodType.APPLE_PAY },
        { type: PaymentMethodType.CREDIT_CARD },
        { type: PaymentMethodType.GOOGLE_PAY },
        { type: PaymentMethodType.PAYPAL },
        { type: PaymentMethodType.VENMO },
        { type: PaymentMethodType.BANCONTACT },
        { type: PaymentMethodType.BLIK },
        { type: PaymentMethodType.EPS },
        { type: PaymentMethodType.GIROPAY },
        { type: PaymentMethodType.IDEAL },
        { type: PaymentMethodType.SOFORT },
        { type: PaymentMethodType.MYBANK },
        { type: PaymentMethodType.P24 },
      ],
      express: [
        { type: PaymentMethodType.PAYPAL },
        { type: PaymentMethodType.PAYPAL_VAULT },
        { type: PaymentMethodType.CREDIT_CARD_VAULT },
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
    const isPureVault =
      paymentMethodType === PaymentMethodType.PAYPAL_VAULT || paymentMethodType === PaymentMethodType.CREDIT_CARD_VAULT;
    const isExpress = paymentMethodType === 'PayPal' && builderType === 'express';

    const ctCart = await this.ctCartService.getCart({
      id: getCartIdFromContext(),
    });
    this.validateCartRequiredData(ctCart, isPureVault);

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

    const lastPaymentRef = !isPureVault
      ? ctCart.paymentInfo?.payments?.[ctCart.paymentInfo.payments.length - 1]
      : undefined;

    // Execute all optional data fetching in parallel
    const [customer, shippingMethodsResult, amountPlanned, existingPayment] = await Promise.all([
      ctCart.customerId ? this.braintreeCustomerService.getCtCustomer(ctCart.customerId) : Promise.resolve(undefined),
      isExpress ? this.getShippingMethods(ctCart.id) : Promise.resolve([]),
      isPureVault ? ctCart.totalPrice : this.ctCartService.getPaymentAmount({ cart: ctCart }),
      lastPaymentRef ? this.ctPaymentService.getPayment({ id: lastPaymentRef.id }) : Promise.resolve(undefined),
    ]);

    this.validateCustomerRequiredData(customer, isPureVault);

    const braintreeCustomerId = customer?.custom?.fields.braintreeCustomerId;
    const shippingMethods = shippingMethodsResult || [];

    const { payment: reusedPayment, clientToken: cachedToken } = this.existingPaymentAndToken(
      existingPayment,
      amountPlanned,
    );

    const [newPayment, fetchedToken] = await Promise.all([
      reusedPayment
        ? Promise.resolve()
        : this.ctPaymentService.createPayment({
            amountPlanned,
            paymentMethodInfo: { paymentInterface: getConfig().paymentInterface }, //todo - check if a more relevant interface exists
            ...customerPaymentInfo,
            paymentStatus: { interfaceCode: 'Initial', interfaceText: 'Initial' },
          }),
      cachedToken !== undefined
        ? Promise.resolve()
        : getClientToken({ merchantAccountId, customerId: braintreeCustomerId }),
    ]);

    const ctPayment = reusedPayment ?? newPayment;
    const clientToken = cachedToken ?? fetchedToken;
    if (!ctPayment || !clientToken)
      throw new ErrorInvalidOperation(
        `Payment or token resolution failed, payment id ${ctPayment?.id}, cart id: ${ctCart.id}`,
      );

    await Promise.all([
      newPayment && !isPureVault
        ? this.ctCartService.addPayment({
            resource: { id: ctCart.id, version: ctCart.version },
            paymentId: newPayment.id,
          }) //it is not possible to add the payment to empty cart via checkout API, but for the pure vault all relevant data will be saved on customer anyway
        : Promise.resolve(),
      cachedToken === undefined
        ? this.ctPaymentService.updatePayment({
            id: ctPayment.id,
            customFields: handleCustomFieldResponse('getClientToken', clientToken),
            pspInteractions: [
              handleInterfaceInteraction({
                messageName: 'getClientToken',
                message: { merchantAccountId, isPureVault, builderType, paymentMethodType },
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
  }

  private existingPaymentAndToken(
    existingPayment: Payment | undefined,
    amountPlanned: { centAmount: number; currencyCode: string },
  ): { payment: Payment | undefined; clientToken: string | undefined } {
    if (!existingPayment) return { payment: undefined, clientToken: undefined };

    const isAmountMismatch =
      existingPayment.amountPlanned.centAmount !== amountPlanned.centAmount ||
      existingPayment.amountPlanned.currencyCode !== amountPlanned.currencyCode;

    if (isAmountMismatch || existingPayment.transactions.length > 0) {
      return { payment: undefined, clientToken: undefined };
    }

    const tokenInteraction = existingPayment.interfaceInteractions.reduce<CustomFields | undefined>(
      (latest, current) => {
        if (current.fields?.type !== 'getClientTokenResponse') return latest;
        if (!latest) return current;
        return new Date(current.fields.timestamp).getTime() > new Date(latest.fields.timestamp).getTime()
          ? current
          : latest;
      },
      undefined,
    );

    const isTokenFresh =
      !!tokenInteraction && Date.now() - new Date(tokenInteraction.fields.timestamp).getTime() < TOKEN_MAX_AGE_MS;

    if (isTokenFresh && existingPayment.custom?.fields?.getClientTokenResponse) {
      return {
        payment: existingPayment,
        clientToken: JSON.parse(existingPayment.custom.fields.getClientTokenResponse) as string,
      };
    }

    return { payment: existingPayment, clientToken: undefined };
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
        countryCode: ctCart.billingAddress?.country,
        fallbackUrl: getConfig().localPaymentFallbackUrl || undefined,
      },
    };
  }

  public async updateCartShipping({
    newShippingMethodId,
  }: {
    newShippingMethodId: string;
  }): Promise<UpdateCartShippingResponseSchemaDTO> {
    const ctCart = await this.ctCartService.getCart({
      id: getCartIdFromContext(),
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
    const costWithNewShipping = await this.ctCartService.getPaymentAmount({ cart: updatedCard });
    return {
      braintreeAmount: Number(mapCommercetoolsMoneyToBraintreeMoney(costWithNewShipping as CentPrecisionMoney)).toFixed(
        2,
      ),
      discountAmount: updatedCard.discountOnTotalPrice?.discountedAmount
        ? mapCommercetoolsMoneyToBraintreeMoney(updatedCard.discountOnTotalPrice.discountedAmount)
        : undefined,
    }; //as checkout api doesn't support updatePayment amountPlanned - it is postponed to transaction sale in order to speed up the response
  }

  public async transactionSale({
    ctPaymentId,
    paymentMethodNonce,
    paymentToken,
    storeInVaultOnSuccess,
    storeShipping,
    braintreePaymentDetails,
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
    const transactionRequest = mapRequestToBraintreeTransactionSale(
      relevantPaymentInfo,
      storeInVaultOnSuccess,
      storeShipping,
      paymentMethodNonce,
      paymentToken,
      // {
      //   //shipping: braintreePaymentDetails?.braintreeShipping
      // },
    ); //todo - handle other params
    transactionRequest.lineItems = (braintreePaymentDetails?.braintreeLineItems || []).map((item) => ({
      ...item,
      name: item.name.substring(0, 35),
    })); //braintree has 35 char limit for line item name in transactionSale, so we need to cut it to avoid errors, see https://developers.braintreepayments.com/reference/request/transaction/sale/node#line_items-name
    if (braintreePaymentDetails?.extraShippingCost) {
      //will be only submitted in express mode, than shipping was submtted via SDK through update and can be mapped properly
      transactionRequest.shippingAmount = Number(braintreePaymentDetails.extraShippingCost).toFixed(2);
    } //see enabler PayPalMask onShippingChange and onApprove
    try {
      const response = await transactionSale({
        ...transactionRequest, // discountAmount: '18.29', //todo - verify if for Braintree discount, tax and so on mush match
      });
      const customFields = handleCustomFieldResponse('transactionSale', response);
      handleCustomTransactionFields(customFields, response, ctPayment);
      await this.updatePaymentWithTransaction({
        messageName: 'transactionSale',
        request: transactionRequest,
        ctPayment,
        response,
        customFields,
      });
      return this.paymentActionSuccessResponse(ctPayment.id);
    } catch (e) {
      throw new ErrorInvalidOperation(
        `transactionSale failed for payment ${ctPaymentId} with error ${e instanceof Error ? e.message : JSON.stringify(e)}`,
      );
    }
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
    const response = await submitForSettlement(relevantTransaction.interactionId, braintreeAmount);
    const paymentMethodHint = getPaymentMethodHint(response);
    await this.updatePaymentWithTransaction({
      messageName: 'submitForSettlement',
      request: request,
      ctPayment,
      response,
      paymentMethodInfo: { method: `${response.paymentInstrumentType} ${paymentMethodHint || ''}`.trim() },
      //todo - find out what are the alternatives for status interface code and text
    });
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
   * @returns successGeneralResponse
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
    const response = await braintreeRefund(relevantTransactionId, braintreeAmount);
    const customFields = handleCustomFieldResponse('refund', response);
    await this.updatePaymentWithTransaction({
      messageName: 'refund',
      request: { relevantTransactionId, amount },
      ctPayment,
      response,
      customFields,
    });
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
    let response: Transaction;
    if (transaction?.state === 'Initial') {
      await braintreeDeletePayment(transactionId);
      response = {
        amount: mapCommercetoolsMoneyToBraintreeMoney(transaction.amount),
        status: 'voided',
        id: transactionId,
        updatedAt: getCurrentTimestamp(),
      } as Transaction; //other required by type definition fields are not used in communication with commercetools
    } else response = await braintreeVoidTransaction(transactionId);
    const customFields = handleCustomFieldResponse('void', response);
    await this.updatePaymentWithTransaction({
      messageName: 'void',
      request: { transactionId },
      ctPayment,
      response,
      customFields,
    });
    return this.paymentActionSuccessResponse(ctPayment.id);
  }

  //this method corresponds to handleStoredPaymentMethod part for create a new stored method
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
    return await this.braintreeCustomerService.pureVault({
      ctCustomerId,
      ctCustomerVersion,
      braintreeCustomerId,
      paymentMethodNonce,
    });
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
    const localPaymentTypes = new Set<string>([
      PaymentMethodType.BANCONTACT,
      PaymentMethodType.BLIK,
      PaymentMethodType.EPS,
      PaymentMethodType.GIROPAY,
      PaymentMethodType.IDEAL,
      PaymentMethodType.SOFORT,
      PaymentMethodType.MYBANK,
      PaymentMethodType.P24,
    ]);
    if (localPaymentTypes.has(paymentMethodType) && !braintreeMerchantAccount)
      throw new ErrorRequiredField('braintreeMerchantAccount');
  }

  private validateCustomerRequiredData(ctCustomer: Customer | void, isPureVault?: boolean): void {
    if (!isPureVault) return;
    if (!ctCustomer) throw new ErrorInvalidOperation('Customer not found for pure vault payment');
  }
}
