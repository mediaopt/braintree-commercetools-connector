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

type OnclickResponse = {
  sessionId: string;
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
   * A callback function Checkout calls after pay button click. The response of this callback function will include a sessionId to initialize the payment attempt.
   */
  onPayButtonClick: () => Promise<OnclickResponse>;
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
  }) => Promise<void>;
  onComplete?: OnComplete;

  initialAmount: CTAmount;
};

export interface PaymentExpressBuilder {
  build(config: ExpressOptions): ExpressComponent;
}
