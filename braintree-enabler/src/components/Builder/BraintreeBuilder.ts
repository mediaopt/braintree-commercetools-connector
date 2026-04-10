import { createRoot, Root } from "react-dom/client";
import {
  ComponentOptions,
  PaymentComponent,
  PaymentComponentBuilder,
} from "../../payment-enabler/interfaces/enabler";
import { BaseOptions } from "../../payment-enabler/interfaces/baseOptions";
import { CreditCard } from "../CreditCard";
import { PayPal } from "../PayPal";
import { createElement } from "react";
import {
  ACHDefaultStyleProps,
  ApplePayDefaultStyleProps,
  PayPalDefaultStyleProps,
  PayPalExpressStyleProps,
} from "./defaultStyles";
import { ACH } from "../ACH";
import { ApplePay } from "../ApplePay";
import { GooglePay } from "../GooglePay";
import { Venmo } from "../Venmo";
import { BraintreePaymentMethodType } from "./types";
import { FlowType } from "paypal-checkout-components";

const componentWithCustomOptions = (
  paymentMethodType: BraintreePaymentMethodType,
  customOptions: BaseOptions & ComponentOptions,
  builderType?: "dropin" | "express",
) => {
  switch (paymentMethodType) {
    case "ACH":
      return createElement(ACH, { ...ACHDefaultStyleProps, ...customOptions });
    case "ApplePay":
      return createElement(ApplePay, {
        ...ApplePayDefaultStyleProps,
        ...customOptions,
      });
    case "GooglePay":
      return createElement(GooglePay, {
        totalPriceStatus: "FINAL", //todo - move params to options and config and add to options a possobility to set styles params
        googleMerchantId: "merchant-id-from-google",
        acquirerCountryCode: "DE",
        environment: "TEST",
        ...customOptions,
      });
    // case "LocalPaymentMethods":
    //   return createElement(<></>)
    case "PayPal":
      return createElement(PayPal, {
        flow: "checkout" as FlowType, //fallback flow if is not set by config or options
        ...(`${builderType}` === "express"
          ? PayPalExpressStyleProps
          : PayPalDefaultStyleProps),
        ...customOptions,
      });
    case "Venmo":
      return createElement(Venmo, {
        desktopFlow: "desktopWebLogin",
        mobileWebFallBack: true,
        paymentMethodUsage: "multi_use",
        useTestNonce: true,
        setVenmoUserName: (venmoName) => console.log(venmoName),
        ignoreBowserSupport: true,
        ...customOptions,
      });
    default:
      return createElement(CreditCard, customOptions);
  }
};

class BraintreeComponent implements PaymentComponent {
  private root: Root | null = null;

  constructor(
    private paymentMethodType: BraintreePaymentMethodType,
    private baseOptions: BaseOptions,
    private config: ComponentOptions,
    private builderType?: "dropin" | "express",
  ) {}

  async mount(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element with selector "${selector}" not found`);
    }
    element.innerHTML = "";
    this.root = createRoot(element as HTMLElement);
    const componentRender = componentWithCustomOptions(
      this.paymentMethodType,
      {
        ...this.baseOptions,
        ...this.config,
      },
      this.builderType,
    );
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
  public componentHasSubmit = true;

  constructor(
    private type: BraintreePaymentMethodType,
    private baseOptions: BaseOptions,
    private builderType?: "dropin" | "express",
  ) {}

  build(config: ComponentOptions): PaymentComponent {
    return new BraintreeComponent(
      this.type,
      this.baseOptions,
      config,
      this.builderType,
    );
  }
}
