import { CTAmount, OnComplete } from "./general";

export interface ExpressComponent {
  mount(selector: string): void;
}

export type ExpressAddressData = {
  country: string;
  firstName?: string;
  lastName?: string;
  streetName?: string;
  streetNumber?: string;
  additionalStreetInfo?: string;
  region?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
};

// ExpressShippingOptionData can be structured to meet the type contract of the PSP implemented.
export type ExpressShippingOptionData = {
  id: string;
  name: string;
  description?: string;
  isSelected?: boolean;
  amount: CTAmount;
};

export type ExpressOptions = {
  /**
   * A list of ISO 3166 country codes for limiting payments to cards from specific countries.
   */
  allowedCountries?: string[];
  /**
   * Called after the buyer clicks the pay button, before the payment sheet is shown. Checkout is
   * responsible for creating a Cart and associating it with the current session before this promise
   * resolves — see https://docs.commercetools.com/checkout/browser-sdk#use-the-onpaybuttonclick-hook.
   */
  onPayButtonClick: () => Promise<void>;
  /**
   * A callback function that receives an address event when the buyer selects a shipping address in the express checkout pop up.
   @param address The address event received.
   */
  onShippingAddressSelected: (opts: {
    address: ExpressAddressData;
  }) => Promise<void>;
  /**
   * A callback function that retrieves the list of available shipping methods.
   @param address The address to fetch available shipping methods.
   */
  getShippingMethods: (opts: {
    address: ExpressAddressData;
  }) => Promise<ExpressShippingOptionData[]>;
  /**
   * A callback function that receives a shipping method event when the buyer selects a shipping method in the express checkout pop up.
   @param shippingMethod The shippingMethod event received.
   */
  onShippingMethodSelected: (opts: {
    shippingMethod: { id: string };
  }) => Promise<void>;

  /**
   * A Callback called when a payment is authorized.
   @param opts - Authorization event from psp, along with formatted shippingAddress and billingAddress
   */
  onPaymentSubmit: (opts: {
    shippingAddress: ExpressAddressData;
    billingAddress: ExpressAddressData;
    customerEmail: string;
  }) => Promise<void>;
  onComplete?: OnComplete;

  initialAmount: CTAmount;
};

export interface PaymentExpressBuilder {
  build(config: ExpressOptions): ExpressComponent;
}
