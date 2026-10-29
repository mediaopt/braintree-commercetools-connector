import {
  ComponentOptions,
  EnablerOptions,
  PaymentComponentBuilder,
  PaymentEnabler,
} from "./interfaces/enabler";

import { DropinType, PaymentDropinBuilder } from "./interfaces/dropin";
import {
  ExpressComponent,
  ExpressOptions,
  PaymentExpressBuilder,
} from "./interfaces/express";
import {
  StoredComponentBuilder,
  StoredPaymentMethod,
} from "./interfaces/stored";
import { BaseOptions } from "./interfaces/baseOptions";
import { BraintreeBuilder } from "../components/Builder/BraintreeBuilder";
import { BraintreeStoredBuilder } from "../components/Builder/BraintreeStoredBuilder";
import { sessionHeader } from "../helpers/sessionHeader";
import { BraintreePaymentMethodExpressType } from "../components/Builder/types";
import { toBraintreePaymentMethodType } from "../components/Builder/paymentMethodTypeMapping";
import { processorRequest } from "../services/processorRequest";
import { CreatePaymentRequest } from "../services/types";
import { CreatePaymentResponse } from "../types";
import { processorUrls } from "../components/constants";

export class BraintreePaymentEnabler implements PaymentEnabler {
  setupData: Promise<{ baseOptions: BaseOptions }>;
  private standardSetup?: Promise<{ baseOptions: BaseOptions }>;

  constructor(options: BaseOptions) {
    this.setupData = BraintreePaymentEnabler._Setup(options);
  }

  // One commercetools Payment and Braintree client token for every standard/stored component,
  // created when the first one is requested; Express creates its own (see usePayment).
  // A failed creation isn't kept, so the next builder request retries it.
  private getStandardSetup(): Promise<{ baseOptions: BaseOptions }> {
    if (!this.standardSetup) {
      const setup = this.setupData.then(BraintreePaymentEnabler._SetupPayment);
      setup.catch(() => {
        if (this.standardSetup === setup) this.standardSetup = undefined;
      });
      this.standardSetup = setup;
    }
    return this.standardSetup;
  }

  // No paymentMethodType: the payment and client token are the same for every method
  private static _SetupPayment = async ({
    baseOptions,
  }: {
    baseOptions: BaseOptions;
  }): Promise<{ baseOptions: BaseOptions }> => {
    const initialPayment = await processorRequest<
      CreatePaymentRequest,
      CreatePaymentResponse
    >(
      sessionHeader(baseOptions.sessionId),
      processorUrls(baseOptions.processorUrl).createPaymentUrl,
      {},
    );
    // Rejects the builder request, as the commercetools connect-payment-integration-template's builders do on a failed
    // setup request, a refused one (e.g. no session) included. Express doesn't wait for this setup, so it still builds.
    if (!initialPayment) throw new Error("Could not create payment");
    return { baseOptions: { ...baseOptions, initialPayment } };
  };

  private static _Setup = async (
    options: EnablerOptions,
    // getStorePaymentDetails: () => boolean,
    // setStorePaymentDetails: (enabled: boolean) => void,
  ): Promise<{ baseOptions: BaseOptions }> => {
    const configResponse = await fetch(
      options.processorUrl + "/operations/config",
      {
        method: "GET",
        headers: sessionHeader(options.sessionId),
      },
    );

    if (!configResponse.ok) {
      throw new Error("Could not fetch config");
    }

    const configJson = await configResponse.json();

    return Promise.resolve({
      baseOptions: {
        processorUrl: options.processorUrl,
        sessionId: options.sessionId,
        merchantAccountId: configJson.merchantAccountId,
        useKount: !!configJson.useKount,
        fullWidth:
          configJson.fullWidth !== undefined ? configJson.fullWidth : true, //todo - check if add config full width is relevant
        buttonText: configJson.buttonText,
        buttonStyleOverrides: configJson.buttonStyleOverrides,
        braintreeEnvironment: configJson.environment,
        storedPaymentMethodsEnabled:
          !!configJson.storedPaymentMethodsConfig?.isEnabled,
        enableVaulting: !!configJson.enableVaulting,
        hasMerchantAccount: !!configJson.hasMerchantAccount,
        perMethodConfig: configJson.perMethodConfig,
        onError: options.onError,
        purchaseCallback:
          configJson.purchaseCallback ||
          options.onComplete ||
          // Logs only the payment reference: result/options carry shipping address and line items.
          ((result: any) => {
            console.log(
              "It is your responsibility to configure the action on success. The recommended way is to use the return URL in merchant center. Use this log for debug purpose only",
              result?.paymentReference,
            );
          }),
      },
    });
  };
  async createComponentBuilder(
    type: string,
  ): Promise<PaymentComponentBuilder | never> {
    const normalizedType = toBraintreePaymentMethodType(type);
    const { baseOptions } = await this.getStandardSetup();
    return Promise.resolve(
      new BraintreeBuilder(normalizedType, baseOptions, undefined),
    );
  }

  async createDropinBuilder(
    type: DropinType,
  ): Promise<PaymentDropinBuilder | never> {
    throw new Error(`Drop-in builder is not supported for Braintree`);
  }

  async createExpressBuilder(
    type: string,
  ): Promise<PaymentExpressBuilder | never> {
    const normalizedType = toBraintreePaymentMethodType(
      type,
    ) as BraintreePaymentMethodExpressType;
    const { baseOptions } = await this.setupData;
    const inner = new BraintreeBuilder(normalizedType, baseOptions, "express");
    return {
      build(config: ExpressOptions): ExpressComponent {
        // The runtime presence of onPayButtonClick (not which factory method was called) is what
        // distinguishes deferred payment creation from the existing "ready payment" Express usage
        // (e.g. mini-cart), which still calls createExpressBuilder but supplies no onPayButtonClick.
        const { onPayButtonClick, ...rest } = config;
        const deferredPaymentCreation = typeof onPayButtonClick === "function";
        return inner.build({
          ...rest,
          onExpressPayButtonClick: onPayButtonClick,
          deferredPaymentCreation,
        } as ComponentOptions);
      },
    };
  }

  async createStoredPaymentMethodBuilder(
    type: string,
  ): Promise<StoredComponentBuilder | never> {
    const normalizedType = toBraintreePaymentMethodType(type);
    // Type checked first: an unsupported type throws below without creating a payment
    if (normalizedType === "CreditCard") {
      const { baseOptions } = await this.getStandardSetup();
      return new BraintreeStoredBuilder("CreditCardStored", baseOptions);
    }
    /* PAYPAL_STORED_DISABLED / ACH_STORED_DISABLED start — reusing a saved PayPal account or ACH
    bank account is out of scope for this commercetools Checkout SDK build (it only supports
    storing/reusing credit cards at the moment); charging a stored ACH account would also fail
    today since "ACHStored" isn't in the processor's StoredPaymentMethodType enum. Please open an
    issue if you are interested in reusing a saved PayPal account or ACH bank account.
    To re-enable: get baseOptions from `await this.getStandardSetup()` in each branch, as the CreditCard one does.

    if (type === "PayPal")
      return new BraintreeStoredBuilder("PayPalStored", baseOptions);
    if (type === "ACH")
      return new BraintreeStoredBuilder("ACHStored", baseOptions);
    PAYPAL_STORED_DISABLED / ACH_STORED_DISABLED end */
    throw new Error(`Unsupported stored payment method type: ${type}`);
  }

  async getStoredPaymentMethods({
    allowedMethodTypes,
  }: {
    allowedMethodTypes: string[];
  }): Promise<{ storedPaymentMethods?: StoredPaymentMethod[] }> {
    const { baseOptions } = await this.setupData;
    const url = `${baseOptions.processorUrl.replace(/\/$/, "")}/stored-payment-methods`;
    const response = await fetch(url, {
      method: "GET",
      headers: sessionHeader(baseOptions.sessionId),
    });
    if (!response.ok) {
      return {};
    }
    const data = await response.json();
    const methods: StoredPaymentMethod[] = (
      data.storedPaymentMethods ?? []
    ).filter((m: StoredPaymentMethod) => allowedMethodTypes.includes(m.type));
    return { storedPaymentMethods: methods };
  }

  async isStoredPaymentMethodsEnabled(): Promise<boolean> {
    const { baseOptions } = await this.setupData;
    return baseOptions.storedPaymentMethodsEnabled ?? false;
  }

  setStorePaymentDetails(enabled: boolean): void {}
}
