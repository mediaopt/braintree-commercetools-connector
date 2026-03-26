export interface StoredComponent {
  submit(): Promise<void>;
  mount(selector: string): Promise<void>;
  showValidation?(): Promise<void>;
  isValid?(): Promise<boolean>;
  isAvailable?(): Promise<boolean>;
  remove(): Promise<void>;
}

export interface StoredComponentBuilder {
  componentHasSubmit: boolean;
  build(config: StoredComponentOptions): StoredComponent;
}

export type StoredComponentOptions = {
  showPayButton?: boolean;
  onPayButtonClick?: () => Promise<void>;
  id: string;
  brands: string[];
};

type BaseStoredDisplayOptions = {
  logoUrl?: string;
  [key: string]: unknown;
};

type BaseStoredPaymentMethod = {
  id: string;
  type: string;
  createdAt: string; // ISO date string
  isDefault: boolean;
  displayOptions: BaseStoredDisplayOptions;
};

type StoredCardPaymentMethod = BaseStoredPaymentMethod & {
  type: "card";
  displayOptions: BaseStoredDisplayOptions & {
    endDigits?: string;
    brand?: {
      key: string;
    };
    expiryMonth?: number;
    expiryYear?: number;
  };
};

export type StoredPaymentMethod =
  | BaseStoredPaymentMethod
  | StoredCardPaymentMethod;

export type CocoStoredPaymentMethod = StoredPaymentMethod & {
  token: string;
};
