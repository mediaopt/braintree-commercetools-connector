import { venmo } from "braintree-web";

/**
 * Whether Venmo can plausibly be offered on this device/browser. VenmoMask.tsx performs the
 * authoritative check on the created instance (`venmoInstance.isBrowserSupported()`), which
 * reflects the exact flow options configured at `venmo.create()` time (RenderTemplate.tsx hardcodes
 * `desktopFlow="desktopWebLogin"` etc.) — this static, no-instance version is a looser
 * approximation, since it doesn't have those options, but it's enough to give
 * BraintreeComponent.isAvailable() (Builder/BraintreeBuilder.ts) an accurate-enough, proactive
 * answer before it even tries to mount the component. Same precaution added for Apple Pay, see
 * ApplePay/applePayAvailability.ts. Additive only — doesn't replace VenmoMask.tsx's own check.
 */
export const isVenmoSupported = (): boolean => {
  try {
    // @types/braintree-web only declares isBrowserSupported() on the Venmo *instance* interface,
    // even though the SDK also exports it as a static module-level function at runtime (see
    // node_modules/braintree-web/venmo/index.js) — cast needed to call it without an instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (venmo as any).isBrowserSupported();
  } catch {
    return false;
  }
};
