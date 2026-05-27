import {
  CommercetoolsCartService,
  CommercetoolsPaymentService,
  ErrorInvalidOperation,
} from '@commercetools/connect-payments-sdk';
import {
  ModifyPayment,
  ConfigResponse,
  StatusResponse,
  CancelPaymentRequest,
  ModifyPaymentWithTransactionRequest,
} from './types/operation.type';

import { SupportedPaymentComponentsSchemaDTO } from '../dtos/operations/payment-componets.dto';
import {
  PaymentUpdateResponseSchemaDTO,
  PaymentRequestSchemaDTO,
  PaymentResponseSchemaDTO,
  PureVaultRequestSchemaDTO,
  TransactionSaleRequestSchemaDTO,
} from '../dtos/braintree-payment.dto';
import { logger } from 'common-connect';

/**
 * Abstract base class for payment service implementations.
 *
 * Note on method naming: Some methods have been renamed for clarity to better align with:
 * - Braintree SDK and API documentation
 * - Existing commercetools connector Braintree extension implementation
 * - Braintree frontend components implementations
 * Where applicable, original method names from the commercetools template are noted in individual method comments.
 * Exception: modifyPayment method uses commercetools naming scheme to keep compatibility with https://docs.commercetools.com/checkout/payment-intents-api
 *
 * Note on CoCo stored payment methods - only Braintree customer Id is stored on commercetools side.
 * Frontend gets the stored methods on braintree side by token.
 * Therefore, neither get payment methods nor delete payment methods from commercetools are implemented on the processor.
 * todo - implement delete braintree customer id
 *
 * Note on class structure - there are 3 groups of methods
 * - operation - genearal routes required to intitialize the client, do not involve payment or customer yet
 * - payment - responsible for actual payment operations, all methods except createPayment require valid payment
 * - customer - responsible for vault related operations for CoCo customer. Customer id and version is required for these calls.
 */

export abstract class AbstractPaymentService {
  protected ctCartService: CommercetoolsCartService;
  protected ctPaymentService: CommercetoolsPaymentService;

  protected constructor(ctCartService: CommercetoolsCartService, ctPaymentService: CommercetoolsPaymentService) {
    this.ctCartService = ctCartService;
    this.ctPaymentService = ctPaymentService;
  }

  /**
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * OPERATION HANDLERS
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * Get system configuration, status, and supported payment components
   */

  /**
   * Get configurations
   *
   * @remarks
   * Abstract method to fetch system configuration information. The actual implementation should be provided by subclasses.
   *
   * @returns Promise with configuration data including client credentials, environment, and stored payment methods settings
   */
  abstract config(): Promise<ConfigResponse>;

  /**
   * Get status
   *
   * @remarks
   * Abstract method to check the status of Braintree gateway. The actual implementation should be provided by subclasses.
   *
   * @returns Promise with status information from Braintree gateway
   */
  abstract status(): Promise<StatusResponse>;

  /**
   * Get supported payment components
   *
   * @remarks
   * Abstract method to fetch the supported payment components by the processor. The actual implementation should be provided by subclasses.
   *
   * @returns Promise with payment components supported in components, and express modes. Dropin is not supported in current implementation.
   */
  abstract getSupportedPaymentComponents(): Promise<SupportedPaymentComponentsSchemaDTO>;

  /**
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * PAYMENT HANDLERS
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * Create payments and process transactions
   * @remarks Handlers except createPayment require a valid commercetools payment ID.
   */

  /**
   * Create payment
   *
   * @remarks
   * Abstract method to create a payment in commercetools. Replaces commercetools `handleTransaction` method.
   * The actual implementation should be provided by subclasses.
   *
   * This method initializes a payment, fetches payment-specific cart and customer details, and returns them to the enabler.
   * On success, the enabler renders the payment button with all necessary fields pre-filled.
   * The transaction will only be created after the frontend operation completes successfully.
   *
   * @param request - payment configuration including payment method type, builder type, and optional merchant account
   * @returns Promise with client token for frontend rendering and payment object with cart/customer details
   */
  abstract createPayment(request: PaymentRequestSchemaDTO): Promise<PaymentResponseSchemaDTO>;

  /**
   * Transaction Sale
   *
   * @remarks
   * Abstract method to capture a payment of Braintree custom type in commercetools. Replaces commercetools `modify payment (Capture)` method.
   * The actual implementation should be provided by subclasses.
   *
   * @param request - payment ID, payment method details (nonce or token), and optional additional transaction details
   * @returns Promise with success response
   */
  abstract transactionSale(request: TransactionSaleRequestSchemaDTO): Promise<PaymentUpdateResponseSchemaDTO>;

  /**
   * Refund payment
   *
   * @remarks
   * Abstract method to refund a captured payment. The actual implementation should be provided by subclasses.
   *
   * @param request - commercetools payment object, optional braintree money refund amount, optional transaction ID
   * @returns Promise with success response
   */
  abstract refundPayment(request: ModifyPaymentWithTransactionRequest): Promise<PaymentUpdateResponseSchemaDTO>;

  /**
   * Settlement
   *
   * @remarks
   * Abstract method to submit an authorized transaction for settlement (capture). The actual implementation should be provided by subclasses.
   *
   * @param request - commercetools payment and optional transaction ID to settle
   * @returns Promise with success response
   */
  abstract settlement(request: ModifyPaymentWithTransactionRequest): Promise<PaymentUpdateResponseSchemaDTO>;

  /**
   * Cancel payment (void)
   *
   * @remarks
   * Abstract method to void an authorized transaction. The actual implementation should be provided by subclasses.
   *
   * @param request - commercetools payment
   * @returns Promise with success response
   */
  abstract void(request: CancelPaymentRequest): Promise<PaymentUpdateResponseSchemaDTO>;

  /**
   * Modify payment
   *
   * @remarks
   * This method is used to execute Capture/Cancel/Refund payment in external PSPs and update composable commerce.
   * The actual invocation to PSPs should be implemented in subclasses
   *
   * The names for commecetools and braintree methods are mapped in the following way:
   *
   * | commercetools | braintree |
   * |---------------|-----------|
   * | capture       | settlement|
   * | refund        | refund    |
   * | cancel        | void      |
   *
   * reverse is not relevant for braintree connector and not implemented in current connector iteration
   *
   * @param opts - input for payment modification including payment ID, action and payment amount
   * @returns Promise with success response
   */

  public async modifyPayment(opts: ModifyPayment): Promise<PaymentUpdateResponseSchemaDTO> {
    const ctPayment = await this.ctPaymentService.getPayment({
      id: opts.paymentId,
    });
    const request = opts.data.actions[0];
    logger.info(`Received request to modify payment ${opts.paymentId} with action ${request.action}`);
    switch (request.action) {
      case 'capturePayment': {
        return await this.settlement({
          payment: ctPayment,
          amount: request.amount,
        });
      }
      case 'cancelPayment': {
        return await this.void({ payment: ctPayment });
      }
      case 'refundPayment': {
        return await this.refundPayment({
          amount: request.amount,
          payment: ctPayment,
          transactionId: request.transactionId,
        });
      }
      case 'reversePayment': {
        return await this.void({ payment: ctPayment });
      }
      default: {
        throw new ErrorInvalidOperation(`Operation not supported.`);
      }
    }
  }

  /**
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * CUSTOMER HANDLERS
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * Customer payment method management (vault operations)
   * @remarks Handlers require valid commercetools customer ID and version. Payment ID is included in error logs to enable tracing and diagnosis when customer data is unavailable or incomplete.
   */

  /** Pure vault
   * @remarks
   * Abstract method to save a new payment method for a customer. The actual implementation should be provided by subclasses.
   *
   * @param request - commercetools customer ID and version, braintree customer ID (if exists), and payment method nonce
   * @returns Promise with success response
   */

  abstract pureVault(request: PureVaultRequestSchemaDTO): Promise<PaymentUpdateResponseSchemaDTO>;
}
