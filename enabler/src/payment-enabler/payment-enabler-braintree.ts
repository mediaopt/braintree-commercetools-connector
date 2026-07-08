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
import {
  // BraintreePaymentMethodDropInType,
  BraintreePaymentMethodExpressType,
  BraintreePaymentMethodType,
} from "../components/Builder/types";
import { toBraintreePaymentMethodType } from "../components/Builder/paymentMethodTypeMapping";

export class BraintreePaymentEnabler implements PaymentEnabler {
  setupData: Promise<{ baseOptions: BaseOptions }>;

  constructor(options: BaseOptions) {
    this.setupData = BraintreePaymentEnabler._Setup(options);
  }

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
        perMethodConfig: configJson.perMethodConfig,
        purchaseCallback:
          configJson.purchaseCallback ||
          options.onComplete ||
          ((result: any, options: any) => {
            console.log(
              "It is your responsibility to configure the action on success. The recommended way is to use the return URL in merchant center. Use this log for debug purpose only",
              result,
              options,
            );
          }),
      },
    });
  };
  async createComponentBuilder(
    type: BraintreePaymentMethodType,
  ): Promise<PaymentComponentBuilder | never> {
    const normalizedType = toBraintreePaymentMethodType(type);
    const { baseOptions } = await this.setupData;
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
    type: BraintreePaymentMethodExpressType,
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
    const { baseOptions } = await this.setupData;
    if (normalizedType === "CreditCard")
      return new BraintreeStoredBuilder("CreditCardStored", baseOptions);
    /* ACH_STORED_DISABLED start —  reusing a saved PayPal account or ACH bank account is out of scope for this
    commercetools Checkout SDK build (it only supports storing/reusing credit cards at the moment); charging
    a stored ACH account would also fail today since "ACHStored" isn't in the processor's
    StoredPaymentMethodType enum.

    if (type === "PayPal")
      return new BraintreeStoredBuilder("PayPalStored", baseOptions);
    if (type === "ACH")
      return new BraintreeStoredBuilder("ACHStored", baseOptions);
    ACH_STORED_DISABLED end */
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
