/**
 * Represents the payment drop-in types.
 */
export enum DropinType {
  /*
   * The embedded drop-in type which is rendered within the page.
   */
  embedded = "embedded",
  /*
   * The hosted payment page (HPP) drop-in type which redirects the user to a hosted payment page.
   */
  hpp = "hpp",
}

/**
 * Represents the interface for a drop-in component.
 */
export interface DropinComponent {
  /**
   * Submits the drop-in component.
   */
  submit(): Promise<void>;

  /**
   * Mounts the drop-in component to the specified selector.
   * @param selector - The selector where the drop-in component will be mounted.
   */
  mount(selector: string): Promise<void>;
}

/**
 * Represents the options for a drop-in component.
 */
export type DropinOptions = {
  /**
   * Indicates whether to show the pay button.
   **/
  showPayButton?: boolean;

  /**
   * A callback function that is called when the drop-in component is ready.
   * @returns A Promise indicating whether the drop-in component is ready.
   */
  onDropinReady?: () => Promise<void>;

  /**
   * A callback function that is called when the pay button is clicked.
   * @returns A Promise indicating whether the payment should proceed.
   */
  onPayButtonClick?: () => Promise<void>;
};

/**
 * Represents the interface for a payment drop-in builder.
 */
export interface PaymentDropinBuilder {
  /**
   * Indicates whether the drop-in component has a submit action.
   */
  dropinHasSubmit: boolean;

  /**
   * Builds a drop-in component with the specified configuration.
   * @param config - The configuration options for the drop-in component.
   * @returns The built drop-in component.
   */
  build(config: DropinOptions): DropinComponent;
}
