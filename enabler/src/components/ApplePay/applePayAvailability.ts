declare const window: any;

/**
 * Whether Apple Pay can be offered on this device/browser at all. Mirrors the check
 * ApplePayButton.tsx already performs on mount; extracted here so BraintreeComponent.isAvailable()
 * (Builder/BraintreeBuilder.ts) can give a host application (commercetools Checkout) an accurate,
 * proactive answer before it even tries to mount the component — instead of only finding out via
 * ApplePayButton's notification once rendering is attempted.
 */
export const isApplePaySupported = (): boolean => {
  try {
    return "ApplePaySession" in window && window.ApplePaySession.canMakePayments();
  } catch {
    return false;
  }
};
