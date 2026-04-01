import { createRoot, Root } from "react-dom/client";
import {
  ComponentOptions,
  PaymentComponent,
  PaymentComponentBuilder,
} from "../../payment-enabler/interfaces/enabler";
import { BaseOptions } from "../../payment-enabler/interfaces/baseOptions";
import { GeneralComponentsProps } from "../../types";
import { CreditCard } from "../CreditCard/CreditCard";
import { createElement } from "react";

class BraintreeComponent implements PaymentComponent {
  private root: Root | null = null;

  constructor(
    private baseOptions: BaseOptions,
    private config: ComponentOptions,
  ) {}

  async mount(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element with selector "${selector}" not found`);
    }
    element.innerHTML = "";
    this.root = createRoot(element as HTMLElement);
    this.root.render(
      createElement(CreditCard, {
        ...this.baseOptions,
        ...this.config,
        fullWidth: true,
      } as GeneralComponentsProps),
    );
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
  public componentHasSubmit = true;

  constructor(private baseOptions: BaseOptions) {}

  build(config: ComponentOptions): PaymentComponent {
    return new BraintreeComponent(this.baseOptions, config);
  }
}
