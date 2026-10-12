import {
  ThreeDSecure,
  ThreeDSecureVerifyOptions,
  ThreeDSecureVerifyPayload,
} from "braintree-web/three-d-secure";

import { CHALLENGE_SHOW_TIMEOUT_MS, THREEDS_CONTAINER_ID } from "./constants";

// What verifyCardWithShowTimeout rejects with when the challenge wasn't shown in time.
export class ChallengeNotShownError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// window.Cardinal (defined by Songbird) isn't announced by Braintree, so it only words the error;
// it never decides whether to reject.
const challengeNotShownError = () => {
  const [code, hint] = (window as { Cardinal?: unknown }).Cardinal
    ? ["THREEDS_CHALLENGE_NOT_SHOWN", ""]
    : [
        "THREEDS_SONGBIRD_NOT_LOADED",
        ": Cardinal's Songbird.js (3D Secure) was not loaded. If you are the domain owner, please whitelist the hosts listed in https://braintree.github.io/braintree-web/current/#content-security-policy",
      ];
  return new ChallengeNotShownError(
    code,
    `3D Secure challenge was not shown within ${CHALLENGE_SHOW_TIMEOUT_MS / 1000} s${hint}.`,
  );
};

const mountChallenge = (element: HTMLElement) => {
  const container = document.createElement("div");
  container.id = THREEDS_CONTAINER_ID;
  container.className =
    "fixed inset-0 w-full h-full bg-black/50 z-[2147483647] flex items-center justify-center";
  element.classList.add("bg-white");
  container.appendChild(element);
  document.body.appendChild(container);
};

// For the 3DS instance's authentication-modal-close event.
export const unmountChallenge = () => {
  document.getElementById(THREEDS_CONTAINER_ID)?.remove();
};

// One per 3DS instance: a timed-out verification affects the next one.
export const createThreeDSVerifier = (threeDS: ThreeDSecure) => {
  // Set while a timed-out verification's challenge may still be presented; holds that
  // verification's onLateShown (still listening) as its token, so only its own clears reset it.
  let staleChallenge: (() => void) | undefined;

  // threeDS.verifyCard, plus mounting the challenge and rejecting (ChallengeNotShownError) when a
  // requested challenge isn't shown within CHALLENGE_SHOW_TIMEOUT_MS.
  const verifyCardWithShowTimeout = (
    params: ThreeDSecureVerifyOptions,
  ): Promise<ThreeDSecureVerifyPayload> => {
    // Only a challenge needs Songbird, so only a requested challenge starts the timer (public
    // events: lookup-complete asks for it, authentication-iframe-available puts it on the page).
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The challenge is mounted only here, i.e. only while this verification is running.
    const onShown = (event: any, next?: () => void) => {
      clearTimeout(timer);
      mountChallenge(event.element as HTMLElement);
      next?.();
    };
    let onLookup: ((data?: any) => void) | undefined;
    return new Promise<ThreeDSecureVerifyPayload>((resolve, reject) => {
      onLookup = (data?: any) => {
        if (!data?.requiresUserAuthentication) return;
        timer = setTimeout(() => {
          threeDS.cancelVerifyCard(() => {});
          // cancelVerifyCard doesn't stop a challenge still waiting for a slow (not blocked)
          // Songbird: the SDK presents it once Songbird is ready. It is only logged then, never
          // mounted.
          // Retries are refused until this runs, so the listener never sees a newer
          // verification's challenge.
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
          // The SDK settles it only once Songbird is ready or has failed, but a ready Songbird
          // fetches the challenge only after that: keep refusing retries until the late challenge
          // fires, or for a grace period after the SDK settles if it never comes. Neither Braintree
          // nor Cardinal publicly bounds that fetch (cardinalSDKConfig.timeout has no documented
          // default), so the grace period reuses the show timeout's budget.
          staleChallenge = onLateShown;
          const clearLater = () =>
            setTimeout(clearStale, CHALLENGE_SHOW_TIMEOUT_MS);
          sdkVerified.then(clearLater, clearLater);
          reject(challengeNotShownError());
        }, CHALLENGE_SHOW_TIMEOUT_MS);
      };
      threeDS.on("lookup-complete", onLookup);
      threeDS.on("authentication-iframe-available", onShown);
      const sdkVerified = threeDS.verifyCard(params);
      sdkVerified.then(resolve, reject);
    }).finally(() => {
      clearTimeout(timer);
      threeDS.off("lookup-complete", onLookup!);
      threeDS.off("authentication-iframe-available", onShown);
    });
  };

  return {
    verifyCardWithShowTimeout,
    // Callers must refuse to start a verification while this is true.
    isRetryBlocked: () => staleChallenge !== undefined,
  };
};
