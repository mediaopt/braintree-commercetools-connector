import {
  ThreeDSecure,
  ThreeDSecureVerifyOptions,
  ThreeDSecureVerifyPayload,
} from "braintree-web/three-d-secure";

import { CHALLENGE_SHOW_TIMEOUT_MS, THREEDS_CONTAINER_ID } from "./constants";

// What verifyCardWithShowTimeout rejects with when the challenge wasn't shown in time.
// window.Cardinal (defined by Songbird) isn't announced by Braintree, so it only words the error;
// it never decides whether to reject.
export class ChallengeNotShownError extends Error {
  readonly code: "THREEDS_CHALLENGE_NOT_SHOWN" | "THREEDS_SONGBIRD_NOT_LOADED";

  constructor() {
    const songbirdLoaded = !!(window as { Cardinal?: unknown }).Cardinal;
    const hint = songbirdLoaded
      ? ""
      : ": Cardinal's Songbird.js (3D Secure) was not loaded. If you are the domain owner, please whitelist the hosts listed in https://braintree.github.io/braintree-web/current/#content-security-policy";
    super(
      `3D Secure challenge was not shown within ${CHALLENGE_SHOW_TIMEOUT_MS / 1000} s${hint}.`,
    );
    this.name = "ChallengeNotShownError";
    this.code = songbirdLoaded
      ? "THREEDS_CHALLENGE_NOT_SHOWN"
      : "THREEDS_SONGBIRD_NOT_LOADED";
  }
}

const mountChallenge = (element: HTMLElement) => {
  const container = document.createElement("div");
  container.id = THREEDS_CONTAINER_ID;
  container.className =
    "fixed inset-0 w-full h-full bg-black/50 z-[2147483647] flex items-center justify-center";
  element.classList.add("bg-white");
  container.appendChild(element);
  document.body.appendChild(container);
};

// Once per 3DS instance: the challenge container goes when the shopper closes the challenge. A late
// challenge is never mounted (see watchLateChallenge), so there is nothing to remove.
export const setupChallengeContainer = (threeDS: ThreeDSecure) => {
  threeDS.on("authentication-modal-close", () => {
    document.getElementById(THREEDS_CONTAINER_ID)?.remove();
  });
};

// Set while a timed-out verification's challenge may still be presented; holds that
// verification's onLateShown (still listening) as its token, so only its own clears reset it.
// Per page, not per 3DS instance: Cardinal's listeners are page-wide, so a late challenge reaches
// whichever instance listens then, e.g. a new one after the component remounted.
let staleChallenge: (() => void) | undefined;

// Callers must refuse to start a verification while this is true.
export const isRetryBlocked = () => staleChallenge !== undefined;

// threeDS.verifyCard, plus mounting the challenge and rejecting (ChallengeNotShownError) when a
// requested challenge isn't shown within CHALLENGE_SHOW_TIMEOUT_MS.
export const verifyCardWithShowTimeout = (
  threeDS: ThreeDSecure,
  params: ThreeDSecureVerifyOptions,
): Promise<ThreeDSecureVerifyPayload> =>
  new Promise((resolve, reject) => {
    // Only a challenge needs Songbird, so only a requested challenge starts the timer (public
    // events: lookup-complete asks for it, authentication-iframe-available puts it on the page).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      threeDS.off("lookup-complete", onLookup);
      threeDS.off("authentication-iframe-available", onShown);
    };
    // The challenge is mounted only here, i.e. only while this verification is running.
    const onShown = (event: any, next?: () => void) => {
      clearTimeout(timer);
      mountChallenge(event.element as HTMLElement);
      next?.();
    };
    const onLookup = (data?: any) => {
      if (!data?.requiresUserAuthentication) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        cleanup();
        threeDS.cancelVerifyCard(() => {});
        watchLateChallenge(threeDS, sdkVerified);
        reject(new ChallengeNotShownError());
      }, CHALLENGE_SHOW_TIMEOUT_MS);
    };
    threeDS.on("lookup-complete", onLookup);
    threeDS.on("authentication-iframe-available", onShown);
    const sdkVerified = threeDS.verifyCard(params);
    sdkVerified.finally(cleanup).then(resolve, reject);
  });

// cancelVerifyCard doesn't stop a challenge still waiting for a slow (not blocked) Songbird: the
// SDK settles the cancelled verifyCard once Songbird is ready or has failed, and a ready Songbird
// only then fetches the challenge. It is only logged then, never mounted, and retries are refused
// until it arrives, or for a grace period after the SDK settles if it never comes; clearing also
// detaches the listener, so it never sees a newer verification's challenge. Neither Braintree nor
// Cardinal publicly bounds that fetch (cardinalSDKConfig.timeout has no documented default), so
// the grace period reuses the show timeout's budget.
const watchLateChallenge = (
  threeDS: ThreeDSecure,
  sdkVerified: Promise<unknown>,
) => {
  const clearStale = () => {
    if (staleChallenge === onLateShown) {
      staleChallenge = undefined;
      threeDS.off("authentication-iframe-available", onLateShown);
    }
  };
  const onLateShown = () => {
    clearStale();
    console.warn(
      `3D Secure challenge became available after the payment was already rejected (not shown within ${CHALLENGE_SHOW_TIMEOUT_MS / 1000} s); it was not displayed.`,
    );
  };
  threeDS.on("authentication-iframe-available", onLateShown);
  staleChallenge = onLateShown;
  const clearLater = () => setTimeout(clearStale, CHALLENGE_SHOW_TIMEOUT_MS);
  sdkVerified.then(clearLater, clearLater);
};
