import {
  EnablerOptions,
  PaymentComponentBuilder,
  PaymentEnabler,
} from "./interfaces/enabler";

import { DropinType, PaymentDropinBuilder } from "./interfaces/dropin";
import { PaymentExpressBuilder } from "./interfaces/express";
import {
  StoredComponentBuilder,
  StoredPaymentMethod,
} from "./interfaces/stored";
import { BaseOptions } from "./interfaces/baseOptions";
import { BraintreeBuilder } from "../components/Builder/BraintreeBuilder";
import { sessionHeader } from "../helpers/sessionHeader";
import {
  // BraintreePaymentMethodDropInType,
  BraintreePaymentMethodExpressType,
  BraintreePaymentMethodType,
} from "../components/Builder/types";

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
    console.log("[braintree-enabler] processorUrl:", options.processorUrl, "| sessionId:", options.sessionId);//todo - remove after testing
    // Fetch SDK config from processor
    const configResponse = await fetch(
      options.processorUrl + "/operations/config",
      {
        method: "GET",
        headers: sessionHeader(options.sessionId),
      },
    );
    console.log("[braintree-enabler] configResponse:", configResponse);//todo - remove after testing

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
        fullWidth: configJson.fullWidth !== undefined ? configJson.fullWidth : true, //todo - check if add config full width is relevant
        buttonText: configJson.buttonText,
        purchaseCallback:
          configJson.purchaseCallback ||
          options.onComplete ||
          ((result: any, options: any) => {
            console.log("Do something", result, options);
          }),
      },
    });
  };
  async createComponentBuilder(
    type: BraintreePaymentMethodType,
  ): Promise<PaymentComponentBuilder | never> {
    const { baseOptions } = await this.setupData;
    return Promise.resolve(
      new BraintreeBuilder(type, baseOptions, undefined),
    );
  }

  async createDropinBuilder(type: DropinType): Promise<PaymentDropinBuilder | never> {
    throw new Error(`Drop-in builder is not supported for Braintree`);
  }

  async createExpressBuilder(
    type: BraintreePaymentMethodExpressType,
  ): Promise<PaymentComponentBuilder|never> {
    //todo - check if different type for PaymentExpressBuilder makes sence
    const { baseOptions } = await this.setupData;
    return Promise.resolve(
      new BraintreeBuilder(type, baseOptions, "express"),
    );
  }

  createStoredPaymentMethodBuilder(
    type: string,
  ): Promise<StoredComponentBuilder> {
    return Promise.resolve(undefined);
  }

  getStoredPaymentMethods({
    allowedMethodTypes,
  }: {
    allowedMethodTypes: string[];
  }): Promise<{
    storedPaymentMethods?: StoredPaymentMethod[];
  }> {
    return Promise.resolve({});
  }

  isStoredPaymentMethodsEnabled(): Promise<boolean> {
    return Promise.resolve(false);
  }

  setStorePaymentDetails(enabled: boolean): void {}
}
