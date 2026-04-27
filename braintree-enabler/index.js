import { Enabler } from "/src/main.ts";

async function fetchDevJwt() {
  const response = await fetch("http://localhost:9002/jwt/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      iss: "https://issuer.com",
      sub: "test-sub",
      "https://issuer.com/claims/project_key": `${__VITE_CTP_PROJECT_KEY__}`,
    }),
  });
  return (await response.json()).token;
}

const methodsStore = new Map();
const allowedStoredPaymentMethods = ["card"];
const paymentMethodTypeToUseForSPM = allowedStoredPaymentMethods[0];

const btnLoadOthers = document.getElementById("loadComponents");
const btnLoadDropins = document.getElementById("loadDropins");
const btnClear = document.getElementById("clearComponents");
const btnLoadStored = document.getElementById("loadStoredMethods");
const spinner = document.getElementById("spinner");
const methodsContainer = document.getElementById("paymentMethods-container");
const containerExternal = document.getElementById("container--external");
const containerInternal = document.getElementById("container--internal");

function showSpinner() {
  spinner.classList.remove("d-none");
}
function hideSpinner() {
  spinner.classList.add("d-none");
}

function clearUI() {
  methodsStore.clear();
  methodsContainer.innerHTML = "";
  containerExternal.innerHTML = "";
  containerInternal.innerHTML = "";
  document
    .getElementById("storePaymentMethod-container")
    .classList.add("d-none");
  document
    .getElementById("removeStorePaymentMethod-container")
    .classList.add("d-none");
}

function createRadioForMethod(methodId, label) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-check";
  const input = document.createElement("input");
  input.className = "form-check-input";
  input.type = "radio";
  input.name = "paymentMethodRadio";
  input.id = `pm-radio-${methodId}`;
  input.value = methodId;
  const lbl = document.createElement("label");
  lbl.className = "form-check-label";
  lbl.htmlFor = input.id;
  lbl.textContent = label;
  wrapper.appendChild(input);
  wrapper.appendChild(lbl);
  methodsContainer.appendChild(wrapper);
  input.addEventListener("change", (e) => onMethodSelected(methodId));
}

async function onMethodSelected(methodId) {
  // TODO: check if submit works for saved payment methods
  const method = methodsStore.get(methodId);
  if (!method) return;
  containerExternal.innerHTML = "";
  containerInternal.innerHTML = "";

  const builder = method.builder;
  const component = method.component;
  if (builder.componentHasSubmit) {
    await component.mount("#container--external");
    const customButton = document.createElement("button");
    customButton.textContent = "Pay with " + methodId.split("-")[1];
    customButton.className = "btn btn-lg btn-primary btn-block mt-3";
    customButton.addEventListener("click", async () => {
      if (!document.getElementById("termsCheckbox").checked) {
        alert("Agree to terms");
        return;
      }
      const storePM = document.getElementById("storePaymentMethod")?.checked;
      await component.submit({ storePaymentDetails: !!storePM });
    });
    containerInternal.appendChild(customButton);
  } else {
    await component.mount("#container--external");
  }
}

async function loadMethods({ includeDropins }) {
  clearUI();
  showSpinner();
  const cartId = document.getElementById("cartId").value.trim();
  if (!cartId) {
    hideSpinner();
    return alert("Enter cart ID");
  }

  const token = await fetchDevJwt();
  const res = await fetch(
    `${__VITE_PROCESSOR_URL__}/operations/payment-components`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const paymentMethods = await res.json();
  const sessionIdGeneral = await getSessionId(cartId, false);
  const sessionIdDropin = await getSessionId(cartId, true);

  const enablerGeneral = new Enabler({
    processorUrl: __VITE_PROCESSOR_URL__,
    sessionId: sessionIdGeneral,
    merchantAccountId: __BRAINTREE_MERCHANT_ACCOUNT_ID__,
    currencyCode: "EUR",
    countryCode: "DE",
  });
  const enablerDropin = new Enabler({
    processorUrl: __VITE_PROCESSOR_URL__,
    sessionId: sessionIdDropin,
    merchantAccountId: __BRAINTREE_MERCHANT_ACCOUNT_ID__,
    currencyCode: "EUR",
    countryCode: "DE",
  });

  async function registerMethod(category, type, meta) {
    const methodId = `${category}-${type}`;
    const enabler = category === "dropin" ? enablerDropin : enablerGeneral;
    let builder;
    if (category === "dropin")
      builder = await enabler.createDropinBuilder(type);
    else if (category === "express")
      builder = await enabler.createExpressBuilder(type);
    else if (category === "component")
      builder = await enabler.createComponentBuilder(type);
    const component = await builder.build({
      showPayButton: !builder.componentHasSubmit,
      ...(builder.componentHasSubmit
        ? {}
        : {
            onPayButtonClick: async () => {
              // to be used for validation
              const termsChecked =
                document.getElementById("termsCheckbox").checked;
              if (!termsChecked) {
                event.preventDefault();
                alert("You must agree to the terms and conditions.");
                return Promise.reject("error-occurred");
              }
              return Promise.resolve(true); // change to true, to test payment flow
            },
          }),
      ...(category === "express"
        ? {
            onPayButtonClick: async () => {
              console.log("onPaymentInit event received");
              return Promise.resolve({
                sessionId: sessionIdGeneral,
              });
            },
            onShippingAddressSelected: setShippingAddress,
            getShippingMethods: getShippingMethods,
            onShippingMethodSelected: setShippingMethod,
            onPaymentSubmit: async (opts) => {
              await setShippingAddress({ address: opts.shippingAddress });
              await setBillingAddress({ address: opts.billingAddress });
              return Promise.resolve();
            },
            onComplete: async (data) => {
              console.log(data, "-> payment data");
              return Promise.resolve();
            },
            initialAmount: {
              centAmount: 2000,
              currencyCode: "EUR",
            },
          }
        : {}),
    });
    methodsStore.set(methodId, {
      id: methodId,
      type,
      category,
      meta,
      enabler,
      builder,
      component,
    });
  }

  if (!includeDropins) {
    for (const m of paymentMethods.components)
      await registerMethod("component", m.type, m);
    for (const m of paymentMethods.express)
      await registerMethod("express", m.type, m);
  }

  if (includeDropins) {
    for (const m of paymentMethods.dropins)
      await registerMethod("dropin", m.type, m);
  }

  methodsContainer.innerHTML = "";
  for (const [methodId, method] of methodsStore.entries())
    createRadioForMethod(methodId, `${method.category} — ${method.type}`);

  const firstRadio = document.querySelector('input[name="paymentMethodRadio"]');
  if (firstRadio) {
    firstRadio.checked = true;
    firstRadio.dispatchEvent(new Event("change"));
  }
  hideSpinner();
}

btnLoadOthers.addEventListener("click", (e) => {
  e.preventDefault();
  const cartId = document.getElementById("cartId").value;
  ckoCartId = cartId;
  loadMethods({ includeDropins: false });
});
btnLoadDropins.addEventListener("click", (e) => {
  e.preventDefault();
  loadMethods({ includeDropins: true });
});
btnLoadStored.addEventListener("click", async (e) => {
  e.preventDefault();
  const cartId = document.getElementById("cartId").value.trim();
  const sessionIdSavedPayments = await getSessionId(cartId, false);
  const enabler = new Enabler({
    processorUrl: __VITE_PROCESSOR_URL__,
    merchantAccountId: __BRAINTREE_MERCHANT_ACCOUNT_ID__,
    sessionId: sessionIdSavedPayments,
    currencyCode: "EUR",
    countryCode: "DE",
  });
  showSpinner();
  const builder = await enabler.createStoredPaymentMethodBuilder(
    paymentMethodTypeToUseForSPM,
  );
  const stored = await enabler.getStoredPaymentMethods({
    allowedMethodTypes: allowedStoredPaymentMethods,
  });
  if (!stored.storedPaymentMethods.length) {
    containerExternal.textContent = "No saved payment methods found";
    hideSpinner();
    return;
  }
  let selectedSPM = stored.storedPaymentMethods[0];
  if (stored.storedPaymentMethods.length > 1) {
    for (const spm of stored.storedPaymentMethods) {
      if (
        confirm(
          `Use stored payment method ending ****${spm.displayOptions.endDigits}?`,
        )
      ) {
        selectedSPM = spm;
        break;
      }
    }
  }
  const component = await builder.build({
    id: selectedSPM.id,
    brands: [selectedSPM.displayOptions.brand.key],
    showPayButton: !builder.componentHasSubmit,
  });
  containerExternal.innerHTML = "";
  await component.mount("#container--external");
  hideSpinner();
});

btnClear.addEventListener("click", (e) => {
  e.preventDefault();
  clearUI();
});
