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
import { isApplePaySupported } from "../ApplePay/applePayAvailability";
import { isVenmoSupported } from "../Venmo/venmoAvailability";

// Per-method device/browser-capability checks for isAvailable() below. Methods not listed here
// are always considered available — most payment methods don't need a precheck. Add a new entry
// here (rather than another branch inline) when a method needs one.
const AVAILABILITY_CHECKS: Partial<Record<BraintreePaymentMethodType, () => boolean>> = {
  ApplePay: isApplePaySupported,
  Venmo: isVenmoSupported,
};

class BraintreeComponent implements PaymentComponent {
  private root: Root | null = null;
  private submitHandler:
    | ((storePaymentDetails?: boolean) => Promise<void>)
    | null = null;

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
    const customOptions: BaseOptions & ComponentOptions = {
      ...this.baseOptions,
      ...this.config,
      onRegisterSubmit: (handler) => {
        this.submitHandler = handler;
      },
    };
    const componentRender = createElement(RenderTemplate, {
      paymentMethodType: this.paymentMethodType,
      customOptions,
      builderType: this.builderType,
    });
    this.root.render(componentRender);
  }

  async submit({
    storePaymentDetails,
  }: {
    storePaymentDetails?: boolean;
  }): Promise<void> {
    if (!this.submitHandler) {
      throw new Error(
        "submit() called before component is ready or payment method does not support it",
      );
    }
    await this.submitHandler(storePaymentDetails);
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
    return AVAILABILITY_CHECKS[this.paymentMethodType]?.() ?? true;
  }

  unmount(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

export class BraintreeBuilder implements PaymentComponentBuilder {
  // Components that use onRegisterSubmit instead of an internal pay button —
  // the host calls component.submit() to trigger payment for these types.
  static readonly SUBMIT_HAS_CALLBACK: BraintreePaymentMethodType[] = [
    "CreditCard",
    "ACH",
  ];

  public componentHasSubmit: boolean;

  constructor(
    private paymentMethodType: BraintreePaymentMethodType,
    private baseOptions: BaseOptions,
    private builderType: BuilderType,
  ) {
    this.componentHasSubmit =
      BraintreeBuilder.SUBMIT_HAS_CALLBACK.includes(paymentMethodType);
  }

  build(config: ComponentOptions): PaymentComponent {
    return new BraintreeComponent(
      this.paymentMethodType,
      this.baseOptions,
      config,
      this.builderType,
    );
  }
}
