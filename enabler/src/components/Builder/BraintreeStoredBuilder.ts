import { createRoot, Root } from "react-dom/client";
import {
  StoredComponent,
  StoredComponentBuilder,
  StoredComponentOptions,
} from "../../payment-enabler/interfaces/stored";
import { BaseOptions } from "../../payment-enabler/interfaces/baseOptions";
import { ComponentOptions } from "../../payment-enabler/interfaces/enabler";
import { createElement } from "react";
import { RenderTemplate } from "../RenderTemplate";

class BraintreeStoredComponent implements StoredComponent {
  private root: Root | null = null;
  private submitHandler: ((storePaymentDetails?: boolean) => Promise<void>) | null = null;

  constructor(
    // "ACHStored", "PayPalStored" removed: ACH_STORED_DISABLED — see payment-enabler-braintree.ts
    private paymentMethodType: "CreditCardStored",
    private baseOptions: BaseOptions,
    private config: StoredComponentOptions,
  ) {}

  async mount(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element with selector "${selector}" not found`);
    }
    element.innerHTML = "";
    this.root = createRoot(element as HTMLElement);
    // StoredComponentOptions.onPayButtonClick returns Promise<void> while ComponentOptions
    // expects Promise<{ storePaymentDetails? }>; cast is safe because RenderTemplate
    // does not inspect the return value of onPayButtonClick for stored components.
    const customOptions = {
      ...this.baseOptions,
      ...this.config,
      onRegisterSubmit: (handler: (storePaymentDetails?: boolean) => Promise<void>) => {
        this.submitHandler = handler;
      },
    } as BaseOptions & ComponentOptions;
    this.root.render(
      createElement(RenderTemplate, {
        paymentMethodType: this.paymentMethodType,
        customOptions,
        builderType: undefined,
      }),
    );
  }

  async submit(): Promise<void> {
    await this.submitHandler?.();
  }

  async remove(): Promise<void> {
    const token = this.config.id;
    if (!token) return;
    const url = `${this.baseOptions.processorUrl.replace(/\/$/, '')}/stored-payment-methods/${token}`;
    const response = await fetch(url, { method: 'DELETE', headers: { 'X-Session-Id': this.baseOptions.sessionId } });
    if (!response.ok) {
      throw new Error(`Failed to delete stored payment method: ${response.status}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export class BraintreeStoredBuilder implements StoredComponentBuilder {
  // All stored components use onRegisterSubmit — the host calls component.submit() to trigger payment.
  public componentHasSubmit = true;

  constructor(
    // "ACHStored",  "PayPalStored" removed: ACH_STORED_DISABLED — see payment-enabler-braintree.ts
    private paymentMethodType: "CreditCardStored",
    private baseOptions: BaseOptions,
  ) {}

  build(config: StoredComponentOptions): StoredComponent {
    return new BraintreeStoredComponent(
      this.paymentMethodType,
      this.baseOptions,
      config,
    );
  }
}
