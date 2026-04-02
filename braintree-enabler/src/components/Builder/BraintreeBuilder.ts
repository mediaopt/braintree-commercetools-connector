import { createRoot, Root } from "react-dom/client";
import {
  ComponentOptions,
  PaymentComponent,
  PaymentComponentBuilder,
} from "../../payment-enabler/interfaces/enabler";
import { BaseOptions } from "../../payment-enabler/interfaces/baseOptions";
import { GeneralComponentsProps } from "../../types";
import { CreditCard } from "../CreditCard";
import { PayPal } from "../PayPal";
import { createElement } from "react";
import {
  ButtonColorOption,
  ButtonLabelOption,
  ButtonShapeOption,
  ButtonSizeOption,
  FlowType,
  Intent,
} from "paypal-checkout-components";

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
      createElement(PayPal, {
        ...this.baseOptions,
        ...this.config,
        flow: "checkout" as FlowType,
        buttonColor: "blue" as ButtonColorOption,
        buttonLabel: "pay" as ButtonLabelOption,
        payLater: true,
        payLaterButtonColor: "blue" as ButtonColorOption,
        locale: "en_GB",
        intent: "capture" as Intent,
        useKount: true,
        shape: "pill" as ButtonShapeOption,
        size: "small" as ButtonSizeOption,
        tagline: true,
        height: 55,
        purchaseCallback: (result, options) => {
          console.log(`do something, ${result}, ${options}`);
        },
      }),
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
