import {
  statusHandler,
  healthCheckCommercetoolsPermissions,
  ErrorRequiredField,
  ErrorInvalidOperation,
  Transaction as CTTransaction,
  Cart,
  Customer,
} from '@commercetools/connect-payments-sdk';

import { CustomerResourceIdentifier } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/customer';
import { ShippingMethod, CentPrecisionMoney } from '@commercetools/platform-sdk';

import {
  CancelPaymentRequest,
  ConfigResponse,
  PaymentProviderModificationResponse,
  RefundPaymentRequest,
  ReversePaymentRequest,
  StatusResponse,
} from './types/operation.type';

import { SupportedPaymentComponentsSchemaDTO } from '../dtos/operations/payment-componets.dto';
import { PaymentModificationStatus } from '../dtos/operations/payment-intents.dto';
import packageJSON from '../../package.json';

import { AbstractPaymentService } from './abstract-payment.service';
import { getConfig } from '../config/config';
import { appLogger, paymentSDK } from '../payment-sdk';
import { BraintreePaymentServiceOptions } from './types/braintree-payment.type';
import {
  GeneralResponseSuccessSchemaDTO,
  PaymentMethodType,
  PaymentOutcome,
  PaymentRequestSchemaDTO,
  PaymentResponseSchemaDTO,
  PureVaultRequestSchemaDTO,
  TransactionSaleRequestSchemaDTO,
} from '../dtos/braintree-payment.dto';
import { getCartIdFromContext, getPaymentInterfaceFromContext } from '../libs/fastify/context/context';
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
} from 'common-connect/dist';
import { handleCustomTransactionFields, handleCustomFieldResponse } from '../utils/customEntities.utils';

import { mapCTLineItemToBraintreeLineItem } from '../utils/lineItem.utils';
import {
  mapCTShippingToBraintreeShipping,
  mapShippingMethodsToBraintreeShippingOptions,
} from '../utils/shipping.utils';
import { BraintreeCustomerService } from './braintree-customer.service';
import { successGeneralResponse } from './constants';

export class BraintreePaymentService extends AbstractPaymentService {
  private braintreeCustomerService: BraintreeCustomerService;

  constructor(opts: BraintreePaymentServiceOptions) {
    super(opts.ctCartService, opts.ctPaymentService);
    this.braintreeCustomerService = new BraintreeCustomerService({ ctAPI: paymentSDK.ctAPI });
  }

  /**
   * Helper method to check if payment has a transaction in a specific state
   */
  private hasTransactionInState(opts: {
    payment: { transactions?: { type: string; state: string }[] };
    transactionType: string;
    states: string[];
  }): boolean {
    return (
      opts.payment.transactions?.some((t) => t.type === opts.transactionType && opts.states.includes(t.state)) || false
    );
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
      environment: config.braintreeEnvironment,
      storedPaymentMethodsConfig: {
        isEnabled: await this.isStoredPaymentMethodsEnabled(),
      },
    };
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
        description: packageJSON.description,
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
        { type: PaymentMethodType.LOCAL_PAYMENT_METHOD, subtypes: ['IDEALO', 'BLIK'] },
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
   * Cancel payment
   *
   * @remarks
   * Implementation to provide the mocking data for payment cancel in external PSPs
   *
   * @param request - contains {@link https://docs.commercetools.com/api/projects/payments | Payment } defined in composable commerce
   * @returns Promise with mocking data containing operation status and PSP reference
   */
  public async cancelPayment(request: CancelPaymentRequest): Promise<PaymentProviderModificationResponse> {
    await this.ctPaymentService.updatePayment({
      id: request.payment.id,
      transaction: {
        type: 'CancelAuthorization',
        amount: request.payment.amountPlanned,
        interactionId: request.payment.interfaceId,
        state: 'Success',
      },
    });
    return { outcome: PaymentModificationStatus.APPROVED, pspReference: request.payment.interfaceId as string };
  }

  /**
   * Refund payment
   *
   * @remarks
   * Implementation to provide the mocking data for payment refund in external PSPs
   *
   * @param request - contains amount and {@link https://docs.commercetools.com/api/projects/payments | Payment } defined in composable commerce
   * @returns Promise with mocking data containing operation status and PSP reference
   */
  public async refundPayment(request: RefundPaymentRequest): Promise<PaymentProviderModificationResponse> {
    await this.ctPaymentService.updatePayment({
      id: request.payment.id,
      transaction: {
        type: 'Refund',
        amount: request.amount,
        interactionId: request.payment.interfaceId,
        state: 'Success',
      },
    });
    return { outcome: PaymentModificationStatus.APPROVED, pspReference: request.payment.interfaceId as string };
  }

  /**
   * Reverse payment
   *
   * @remarks
   * Abstract method to execute payment reversals in support of automated reversals to be triggered by checkout api. The actual invocation to PSPs should be implemented in subclasses
   *
   * @param request
   * @returns Promise with outcome containing operation status and PSP reference
   */
  public async reversePayment(request: ReversePaymentRequest): Promise<PaymentProviderModificationResponse> {
    const hasCharge = this.hasTransactionInState({
      payment: request.payment,
      transactionType: 'Charge',
      states: ['Success'],
    });
    const hasRefund = this.hasTransactionInState({
      payment: request.payment,
      transactionType: 'Refund',
      states: ['Success', 'Pending'],
    });
    const hasCancelAuthorization = this.hasTransactionInState({
      payment: request.payment,
      transactionType: 'CancelAuthorization',
      states: ['Success', 'Pending'],
    });

    const wasPaymentReverted = hasRefund || hasCancelAuthorization;

    if (hasCharge && !wasPaymentReverted) {
      return this.refundPayment({
        payment: request.payment,
        merchantReference: request.merchantReference,
        amount: request.payment.amountPlanned,
      });
    }

    const hasAuthorization = this.hasTransactionInState({
      payment: request.payment,
      transactionType: 'Authorization',
      states: ['Success'],
    });
    if (hasAuthorization && !wasPaymentReverted) {
      return this.cancelPayment({ payment: request.payment });
    }

    throw new ErrorInvalidOperation('There is no successful payment transaction to reverse.');
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
    merchantAccountId,
    builderType,
    paymentMethodType,
  }: PaymentRequestSchemaDTO): Promise<PaymentResponseSchemaDTO> {
    this.validatePaymentMethod({ merchantAccountId, paymentMethodType });
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

    // Execute all optional data fetching in parallel
    const [customer, shippingMethodsResult, amountPlanned] = await Promise.all([
      ctCart.customerId ? this.braintreeCustomerService.getCtCustomer(ctCart.customerId) : Promise.resolve(undefined),
      isExpress ? this.getShippingMethods(ctCart.id) : Promise.resolve([]),
      this.ctCartService.getPaymentAmount({ cart: ctCart }),
    ]);

    this.validateCustomerRequiredData(customer, isPureVault);

    if (isPureVault) amountPlanned.centAmount = 0;

    const braintreeCustomerId = customer?.custom?.fields.braintreeCustomerId;
    const shippingMethods = shippingMethodsResult || [];

    /**
     * We intentionally don't check if a payment already exists because:
     * It cannot be done through the Checkout API yet
     * Therefore it would unnecessarily slow down the createPayment call
     */

    const ctPayment = await this.ctPaymentService.createPayment({
      amountPlanned,
      paymentMethodInfo: {
        paymentInterface: getPaymentInterfaceFromContext() || 'Braintree', //todo - check if a more relevant interface exists
      },
      ...customerPaymentInfo,
    });

    await this.ctCartService.addPayment({
      resource: {
        id: ctCart.id,
        version: ctCart.version,
      },
      paymentId: ctPayment.id,
    });
    const requestInteraction = handleInterfaceInteraction({
      messageName: 'getClientToken',
      message: { merchantAccountId, isPureVault, builderType, paymentMethodType },
      messageType: 'Request',
    });
    const tokenResponse = await getClientToken({
      merchantAccountId: merchantAccountId,
      customerId: braintreeCustomerId,
    });
    const customFields = handleCustomFieldResponse('getClientToken', tokenResponse); //request is only needed for braintree extension to trigger API flow, for processor it can be seen in interaction logs
    const responseInteraction = handleInterfaceInteraction({
      messageName: 'getClientToken',
      message: tokenResponse,
      messageType: 'Response',
    });

    const updatedPayment = await this.ctPaymentService.updatePayment({
      id: ctPayment.id,
      customFields,
      pspInteractions: [requestInteraction, responseInteraction],
    });

    return {
      braintreeData: { clientToken: tokenResponse, braintreeCustomerId },
      payment: {
        ctPaymentId: updatedPayment.id,
        currency: ctPayment.amountPlanned.currencyCode,
        braintreeAmount: Number(mapCommercetoolsMoneyToBraintreeMoney(ctPayment.amountPlanned)),
        email: ctCart.customerEmail,
        shippingOptions: mapShippingMethodsToBraintreeShippingOptions(
          shippingMethods,
          ctPayment.amountPlanned.currencyCode,
          ctCart.shippingInfo?.shippingMethod?.id,
        ),
        braintreeLineItems: isPureVault
          ? []
          : isExpress
            ? ctCart.lineItems.map((lineItem) => mapCTLineItemToBraintreeLineItem(lineItem, ctCart.locale))
            : undefined,
        braintreeShipping: ctCart.shippingAddress
          ? mapCTShippingToBraintreeShipping(ctCart.shippingAddress)
          : undefined,
        ctCustomerId: customer?.id,
        ctCustomerVersion: customer?.version,
        //taxAmount
        //shippingAmount
        //discountAmount
      },
    };
  }

  public async updateCartShipping({ newShippingMethodId }: { newShippingMethodId: string }): Promise<string> {
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
    return Number(mapCommercetoolsMoneyToBraintreeMoney(costWithNewShipping as CentPrecisionMoney)).toFixed(2);
  }

  public async transactionSale({
    ctPaymentId,
    paymentMethodNonce,
    paymentToken,
    storeInVaultOnSuccess,
    storeShipping,
    braintreePaymentDetails,
  }: TransactionSaleRequestSchemaDTO): Promise<GeneralResponseSuccessSchemaDTO> {
    //todo - handle address change for PayPal express here
    //todo - handle payment amount change if relevant here
    const ctPayment = await this.ctPaymentService.getPayment({ id: ctPaymentId });
    const transactionRequest = mapRequestToBraintreeTransactionSale(
      ctPayment,
      storeInVaultOnSuccess,
      storeShipping,
      paymentMethodNonce,
      paymentToken,
      //{ lineItems: braintreePaymentDetails?.braintreeLineItems, shipping: braintreePaymentDetails?.braintreeShipping },
    ); //todo - handle other params
    //todo - sync cart shipping address and shipping method id if relevant
    if (braintreePaymentDetails?.extraShippingCost) {
      transactionRequest.shippingAmount = Number(braintreePaymentDetails.extraShippingCost).toFixed(2);
    } //see enabler PayPalMask onShippingChange and onApprove
    const requestInteraction = handleInterfaceInteraction({
      messageName: 'transactionSale',
      message: transactionRequest,
      messageType: 'Request',
    });
    try {
      const response = await transactionSale({
        ...transactionRequest, // discountAmount: '18.29', //todo - verify if for Braintree discount, tax and so on mush match
      });
      const customFields = handleCustomFieldResponse('transactionSale', response); //request is only needed for braintree extension to trigger API flow, for processor it can be seen in interaction logs
      const responseInteraction = handleInterfaceInteraction({
        messageName: 'transactionSale',
        message: response,
        messageType: 'Response',
      });
      handleCustomTransactionFields(customFields, response, ctPayment);
      await this.ctPaymentService.updatePayment({
        id: ctPayment.id,
        customFields,
        pspInteractions: [requestInteraction, responseInteraction],
        transaction: mapBraintreeTransactionToCommercetoolsTransaction(ctPayment, response),
        pspReference: response.id, //TODO - verify that pspReference do sets interaction id
      });
      return successGeneralResponse;
    } catch (e) {
      throw new ErrorInvalidOperation(
        `transactionSale failed for payment ${ctPaymentId} with error ${e instanceof Error ? e.message : JSON.stringify(e)}`,
      );
    }
  }

  //see also extension module submitForSettlement
  public async settlement(request: { ctPaymentId: string; transactionId?: string }): Promise<void> {
    const ctPayment = await this.ctPaymentService.getPayment({ id: request.ctPaymentId });
    let relevantTransaction: CTTransaction;
    if (request.transactionId) {
      const targetTransaction = ctPayment.transactions.find(({ id }) => id === request.transactionId);
      if (!targetTransaction)
        throw new ErrorInvalidOperation(
          `Payment ${request.ctPaymentId} doesn't have a transaction with this id ${request.transactionId}`,
        );
      else {
        if (targetTransaction.type !== 'Authorization')
          throw new ErrorInvalidOperation(
            `Transaction with this id ${request.transactionId} can't be settled due to it's type`, //todo - verify which statuses can actually be settled
          );
      }
      relevantTransaction = targetTransaction;
    } else {
      const targetTransactions = ctPayment.transactions.filter(({ type }) => type === 'Authorization');
      if (!targetTransactions.length)
        throw new ErrorInvalidOperation(
          `Payment ${request.ctPaymentId} doesn't have a transaction with a type suitable for settlement`,
        );
      relevantTransaction = targetTransactions[targetTransactions.length - 1];
    }
    const requestInteraction = handleInterfaceInteraction({
      messageName: 'submitForSettlement',
      message: request,
      messageType: 'Request',
    });
    const response = await submitForSettlement(relevantTransaction.id); //for submitting part of the transaction extension through the API should be used
    const responseInteraction = handleInterfaceInteraction({
      messageName: 'submitForSettlement',
      message: response,
      messageType: 'Response',
    });
    const paymentMethodHint = getPaymentMethodHint(response);
    await this.ctPaymentService.updatePayment({
      id: ctPayment.id,
      pspInteractions: [requestInteraction, responseInteraction],
      transaction: mapBraintreeTransactionToCommercetoolsTransaction(ctPayment, response), //todo - get sure that charge is properly mapped
      pspReference: response.id, //TODO - verify that pspReference do sets interaction id
      paymentMethodInfo: { method: `${response.paymentInstrumentType} ${paymentMethodHint || ''}`.trim() },
      //todo - find out what are the alternatives for status interface code and text
    });
  }

  //todo - verify that payPalOrderRequest was never used through frontend flow

  //this method corresponds to handleStoredPaymentMethod part for create a new stored method
  public async pureVault({
    ctCustomerId,
    ctPaymentId,
    ctCustomerVersion,
    braintreeCustomerId,
    paymentMethodNonce,
    //braintree CustomerCreateRequest data (includes nonce) or braintree  PaymentMethodCreateRequest
  }: PureVaultRequestSchemaDTO): Promise<GeneralResponseSuccessSchemaDTO> {
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

  /**
   * Before the create payment request to the PSP is made the input needs to be validated first and then passed to the PSP to either tokenise or pay with a token.
   * Depending on how the PSP integration works the return value of this function could differ or other requirements surrounding the API calls.
   * However the core principle of logic and validations would be the same.
   */
  // async handleStoredPaymentMethod(
  //   request: CreatePaymentRequest,
  //   ctCart: Cart,
  // ): Promise<{ storePaymentMethod?: boolean; token?: string }> {
  //   // Feature itself must be enabled on connector level by the merchant
  //   if (!getStoredPaymentMethodsConfig().enabled) {
  //     return {};
  //   }
  //
  //   // The payment method must be allowed to be tokenised
  //   // if (!getStoredPaymentMethodsConfig().config.allowedPaymentMethods.includes(request.data.paymentMethod.type)) {
  //   //   return {};
  //   // }
  //
  //   // Now it's important to validate what the user wants to do with regards to stored-payment-methods. It could either be:
  //   // 1. Nothing;
  //   // 2. Tokenise a payment method;
  //   // 3. Pay with a stored-payment-method.
  //   // Those values come from the enabler UI where the decided what to do.
  //
  //   const storePaymentMethodFirstTime = request.data.paymentMethod.storePaymentMethod !== undefined;
  //
  //   const storedPaymentMethodId = request.data.paymentMethod.storedPaymentMethodId;
  //   const payWithExistingStoredPaymentMethod = storedPaymentMethodId !== undefined;
  //
  //   if (!storePaymentMethodFirstTime && !payWithExistingStoredPaymentMethod) {
  //     // User does not want to do anything related to stored-payment-methods.
  //     return {};
  //   }
  //
  //   if (storePaymentMethodFirstTime && payWithExistingStoredPaymentMethod) {
  //     // This scenario should never happen. If the enabler indicates it wants to pay and tokenise at the same time there is most likely an implementation error.
  //     return {};
  //   }
  //
  //   // The cart needs to have a customerId set if the incoming request indicated that it wants to either pay or tokenise
  //   if (!ctCart.customerId) {
  //     throw new ErrorRequiredField('customerId', {
  //       privateMessage: 'The customerId is not set on the cart yet the customer wants to tokenize the payment',
  //       privateFields: {
  //         cart: {
  //           id: ctCart.id,
  //           typeId: 'cart',
  //         },
  //       },
  //     });
  //   }
  //
  //   if (storePaymentMethodFirstTime) {
  //     // The user has indicated that it wants to tokenise the payment. Forward this intent to the PSP.
  //     return { storePaymentMethod: storePaymentMethodFirstTime };
  //   } else if (payWithExistingStoredPaymentMethod) {
  //     // The user has selected a existing stored-payment-method to pay with from the enabler/UI.
  //
  //     // It's important to verify if the given payment-method id from the enabler request actually belongs to the `customerId` that is set on the `cart`.
  //     // This can be achieved by fetching the payment-method from CT using the payment-methods service from the connect-payments-sdk.
  //
  //     const paymentMethod = await this.ctPaymentMethodService.get({
  //       id: storedPaymentMethodId,
  //       customerId: ctCart.customerId,
  //     });
  //
  //     // Due note that it could be that the PSP integration works by sending the actual token value from the enabler components to the `/payments` API in the processor.
  //     // In this case one of the two following approaches can be chosen to achieve the same validation:
  //     // const paymentMethod = await this.ctPaymentMethodService.getByTokenValue({
  //     //   customerId: ctCart.customerId,
  //     //   paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
  //     //   interfaceAccount: getStoredPaymentMethodsConfig().config.interfaceAccount,
  //     //   tokenValue: '<value from the incoming request body>',
  //     // });
  //     //
  //     // ### OR
  //     //
  //     // const belongsToCustomer = await this.ctPaymentMethodService.doesTokenBelongsToCustomer({
  //     //   customerId: ctCart.customerId,
  //     //   paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
  //     //   interfaceAccount: getStoredPaymentMethodsConfig().config.interfaceAccount,
  //     //   tokenValue: '<value from the request body>',
  //     // });
  //     //
  //     // if (!belongsToCustomer) {
  //     //   // Take appropiate action
  //     // }
  //
  //     // Send the "paymentMethod.token.value" attribute to the PSP in order to pay with an tokenised payment method
  //     return { token: paymentMethod.token?.value };
  //   }
  //
  //   return {};
  // }

  /**
   * Returns a list of stored-payment-methods that are available in the current session.
   *
   */
  async getStoredPaymentMethods(): Promise<StoredPaymentMethodsResponse> {
    // First fetch the customerId from the cart
    const customerId = await this.getCustomerIdFromCart();

    // Then fetch all known stored-payment-methods from CT. Using the `paymentInterface` and `interfaceAccount` it will only return stored-payment-methods that match with this connectors configuration.
    const storedPaymentMethods = await this.ctPaymentMethodService.find({
      customerId: customerId,
      paymentInterface: getStoredPaymentMethodsConfig().config.paymentInterface,
      interfaceAccount: getStoredPaymentMethodsConfig().config.interfaceAccount,
    });

    // Map over the payment methods and include displayable friendly data for Checkout to use.
    return {
      storedPaymentMethods: storedPaymentMethods.results.map((spm: PaymentMethod) => {
        const res: StoredPaymentMethod = {
          id: spm.id,
          createdAt: spm.createdAt,
          isDefault: spm.default || false,
          token: spm.token?.value || '',
          type: spm.method || '',
          // The displayOptions is optional but will be used for displaying this data in the UI. Must be enhanced from with data from the PSP since that is not (yet) stored on the payment-methods in CT.
          // Due to the fact that this template connector does not have a actual PSP attached it's not possible to now these values from just the CT payment-methods. For now return some dummy static data.
          displayOptions: {
            brand: {
              key: 'visa',
            },
            endDigits: '1111',
            expiryMonth: 3,
            expiryYear: 30,
          },
        };

        return res;
      }),
    };
  }

  async deleteStoredPaymentMethodViaCart(id: string): Promise<void> {
    const customerId = await this.getCustomerIdFromCart();

    await this.deleteStoredPaymentMethod(id, customerId);
  }

  /**
   * Deletes the stored payment method by ID and customerId
   */
  async deleteStoredPaymentMethod(id: string, customerId: string): Promise<void> {
    const paymentMethod = await this.ctPaymentMethodService.get({
      id,
      customerId: customerId,
    });

    try {
      await this.ctPaymentMethodService.delete({
        customerId: customerId,
        id: paymentMethod.id,
        version: paymentMethod.version,
      });

      log.info('Successfully deleted payment-method in CT', {
        customer: { id: customerId, type: 'customer' },
        paymentMethod: { id: paymentMethod.id, type: 'payment-method', version: paymentMethod.version },
      });
    } catch (error) {
      log.error('Could not delete payment-method in CT', {
        error,
        customer: { id: customerId, type: 'customer' },
        paymentMethod: { id: paymentMethod.id, type: 'payment-method' },
      });

      throw error;
    }

    // After a successful deletion of the stored payment method in CT. Perform any delete operation on the side of the PSP.
    // For Checkout perspective it's intended that the payment-method in CT is removed first and only if that succeeds proceed to remove it from the PSP.
  }

  public async handleTransaction(transactionDraft: TransactionDraftDTO): Promise<TransactionResponseDTO> {
    const TRANSACTION_AUTHORIZATION_TYPE: TransactionType = 'Authorization';
    const TRANSACTION_STATE_SUCCESS: TransactionState = 'Success';
    const TRANSACTION_STATE_FAILURE: TransactionState = 'Failure';

    const maxCentAmountIfSuccess = 10000;

    const ctCart = await this.ctCartService.getCart({ id: transactionDraft.cartId });

    let amountPlanned = transactionDraft.amount;
    if (!amountPlanned) {
      amountPlanned = await this.ctCartService.getPaymentAmount({ cart: ctCart });
    }

    const isBelowSuccessStateThreshold = amountPlanned.centAmount < maxCentAmountIfSuccess;

    const newlyCreatedPayment = await this.ctPaymentService.createPayment({
      amountPlanned,
      paymentMethodInfo: {
        paymentInterface: transactionDraft.paymentInterface,
      },
    });

    await this.ctCartService.addPayment({
      resource: {
        id: ctCart.id,
        version: ctCart.version,
      },
      paymentId: newlyCreatedPayment.id,
    });

    const transactionState: TransactionState = isBelowSuccessStateThreshold
      ? TRANSACTION_STATE_SUCCESS
      : TRANSACTION_STATE_FAILURE;

    const pspReference = randomUUID().toString();

    await this.ctPaymentService.updatePayment({
      id: newlyCreatedPayment.id,
      pspReference: pspReference,
      transaction: {
        amount: amountPlanned,
        type: TRANSACTION_AUTHORIZATION_TYPE,
        state: transactionState,
        interactionId: pspReference,
      },
    });

    if (isBelowSuccessStateThreshold) {
      return {
        transactionStatus: {
          errors: [],
          state: 'Pending',
        },
      };
    } else {
      return {
        transactionStatus: {
          errors: [
            {
              code: 'PaymentRejected',
              message: `Payment '${newlyCreatedPayment.id}' has been rejected.`,
            },
          ],
          state: 'Failed',
        },
      };
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

  private validatePaymentMethod({ merchantAccountId, paymentMethodType }: PaymentRequestSchemaDTO): void {
    if (paymentMethodType === 'LocalPaymentMethod' && !merchantAccountId)
      throw new ErrorRequiredField('merchantAccountId');
  }

  private validateCustomerRequiredData(ctCustomer: Customer | void, isPureVault?: boolean): void {
    if (!isPureVault) return;
    if (!ctCustomer) throw new ErrorInvalidOperation('Customer not found for pure vault payment');
  }
}
