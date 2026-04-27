import { createRoot, Root } from "react-dom/client";
import {
  ComponentOptions,
  PaymentComponent,
  PaymentComponentBuilder,
} from "../../payment-enabler/interfaces/enabler";
import { BaseOptions } from "../../payment-enabler/interfaces/baseOptions";
import { createElement } from "react";
import { BraintreePaymentMethodType } from "./types";
import { RenderTemplate } from "../RenderTemplate";
import { BuilderType } from "../../types";

class BraintreeComponent implements PaymentComponent {
  private root: Root | null = null;

  constructor(
    private paymentMethodType: BraintreePaymentMethodType,
    private baseOptions: BaseOptions,
    private config: ComponentOptions,
    private builderType: BuilderType,
  ) {}

  async mount(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element with selector "${selector}" not found`);
    }
    element.innerHTML = "";
    this.root = createRoot(element as HTMLElement);
    const componentRender = createElement(RenderTemplate, {
      paymentMethodType: this.paymentMethodType,
      customOptions: { ...this.baseOptions, ...this.config },
      builderType: this.builderType,
    });
    this.root.render(componentRender);
  }

  async submit({
    storePaymentDetails,
  }: {
    storePaymentDetails?: boolean;
  }): Promise<void> {
    // Handle payment submission
  }

  async showValidation(): Promise<void> {
    // Show validation messages
  }

  async isValid(): Promise<boolean> {
    return true;
  }

  async getState() {
    return {};
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  unmount(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

export class BraintreeBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = false; //instead of a submit action Braintree has a complete submit button, no additional button render is needed

  constructor(
    private paymentMethodType: BraintreePaymentMethodType,
    private baseOptions: BaseOptions,
    private builderType: BuilderType,
  ) {}

  build(config: ComponentOptions): PaymentComponent {
    return new BraintreeComponent(
      this.paymentMethodType,
      this.baseOptions,
      config,
      this.builderType,
    );
  }
}
