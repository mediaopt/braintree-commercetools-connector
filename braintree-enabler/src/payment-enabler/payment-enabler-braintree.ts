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
    // Fetch SDK config from processor
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

    const sdkOptions = {
      // environment: configJson.environment,
      environment: "test",
    };

    return Promise.resolve({
      baseOptions: {
        // Required BaseOptions properties
        processorUrl: options.processorUrl,
        sessionId: options.sessionId,
        merchantAccountId: options.merchantAccountId,
        useKount: !!configJson.useKount,
        fullWidth: options.fullWidth !== undefined ? options.fullWidth : true, //todo - check if add config full width is relevant
        buttonText: configJson.buttonText || options.buttonText || "Pay €X",

        // Required GeneralComponentsProps properties
        //options.purchaseCallback ||
        purchaseCallback:
          configJson.purchaseCallback ||
          options.purchaseCallback ||
          ((result: any, options: any) => {
            console.log("Do something", result, options);
          }),
        //
        // taxAmount: options.taxAmount,
        // shippingAmount: options.shippingAmount,
        // discountAmount: options.discountAmount,
        // shippingMethodId: options.shippingMethodId,
        //
        // // Cart information and other optional props
        // cartInformation: options.cartInformation,
      },
    });
  };
  async createComponentBuilder(
    paymentMethodType: string,
  ): Promise<PaymentComponentBuilder> {
    const { baseOptions } = await this.setupData;
    return Promise.resolve(
      new BraintreeBuilder(paymentMethodType, baseOptions),
    );
  }

  createDropinBuilder(type: DropinType): Promise<PaymentDropinBuilder> {
    return Promise.resolve(undefined);
  }

  createExpressBuilder(type: string): Promise<PaymentExpressBuilder> {
    return Promise.resolve(undefined);
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
