import React, { useState } from "react";
import "./App.css";

import { CreditCard } from "./components/CreditCard";
import { GooglePay } from "./components/GooglePay";
import { Venmo } from "./components/Venmo";
import { PayPal } from "./components/PayPal";
import { ApplePay } from "./components/ApplePay";
import { ACH } from "./components/ACH";
import {
  Bancontact,
  P24,
  Sofort,
  BLIK,
  MyBank,
  EPS,
  Giropay,
  Grabpay,
  IDeal,
} from "./components/LocalPaymentMethods";
import {
  ShippingAddressOverride,
  Shipping,
  PayPalShippingOptions,
  LineItem,
} from "./types";

import {
  ButtonColorOption,
  ButtonLabelOption,
  FlowType,
  Intent,
  ButtonShapeOption,
  ButtonSizeOption,
} from "paypal-checkout-components";

const CC_FRONTEND_EXTENSION_VERSION: string = "devmajidabbasi";
const FRONTASTIC_SESSION: string =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjYXJ0SWQiOiI2YjRhMGIyYy1lYmFlLTRhZGMtYmQyNS1mMTg4MjliOTNlYzAiLCJ3aXNobGlzdElkIjoiMmI3ZDc4OWYtMGJmNi00NGQ3LThkZDctYzJlMjg0OGJiNTJkIn0.96b5PacXfBwfqkiI8lm5OEDsJb7o3Cps-hHayaF4b3I";

function App() {
  const cartInformation = {
    account: {
      email: "test@test.com",
    },
    billing: {
      firstName: "John",
      lastName: "Smith",
      streetName: "Hochstraße",
      streetNumber: "37",
      city: "Berlin",
      country: "DE",
      postalCode: "12045",
    },
    shipping: {
      firstName: "John",
      lastName: "Smith",
      streetName: "Hochstraße",
      streetNumber: "37",
      city: "Berlin",
      country: "DE",
      postalCode: "12045",
    },
  };

  const requestHeader = {
    "Frontastic-Session": FRONTASTIC_SESSION,
    "Commercetools-Frontend-Extension-Version": CC_FRONTEND_EXTENSION_VERSION,
  };

  const lineItems: LineItem[] = [
    {
      name: "Product",
      kind: "debit",
      quantity: "6",
      unitAmount: "1.00",
      unitOfMeasure: "unit",
      totalAmount: "6.00",
      taxAmount: "0.00",
      discountAmount: "0.00",
      productCode: "54321",
      commodityCode: "98765",
    },
  ];

  const shipping: Shipping = {
    firstName: "Majid",
    lastName: "Abbasi",
  };

  const shippingOptions: PayPalShippingOptions[] = [
    {
      amount: 3.0,
      countryCode: "DE",
    },
    {
      amount: 4.0,
      countryCode: "US",
    },
  ];

  const ENDPOINT_URL: string =
    "https://poc-mediaopt.frontastic.rocks/frontastic/action";

  const params = {
    createPaymentUrl: `${ENDPOINT_URL}/payment/createPayment`,
    getClientTokenUrl: `${ENDPOINT_URL}/payment/getClientToken`,
    purchaseUrl: `${ENDPOINT_URL}/payment/createPurchase`,
    purchaseCallback: (result: any, options: any) => {
      console.log("Do something", result, options);
    },
    fullWidth: true,
    buttonText: "Pay €X",
    cartInformation: cartInformation,
    lineItems: lineItems,
    shipping: shipping,
    taxAmount: "0.00",
    shippingAmount: "0.00",
    discountAmount: "0.00",
    shippingMethodId: "da416140-39bf-4677-8882-8b6cab23d981",
  };

  const vaultingParams = {
    createPaymentForVault: `${ENDPOINT_URL}/payment/createPaymentForVault`,
    vaultPaymentMethodUrl: `${ENDPOINT_URL}/payment/vaultPaymentMethod`,
    isPureVault: true,
  };

  const localPaymentParams = {
    saveLocalPaymentIdUrl: `${ENDPOINT_URL}/payment/setLocalPaymentId`,
    fallbackUrl: "/test",
    fallbackButtonText: "purchase",
    merchantAccountId: "",
  };

  const paypalShippingAddressOverride: ShippingAddressOverride = {
    recipientName: "Scruff McGruff",
    line1: "1234 Main St.",
    line2: "Unit 1",
    city: "Chicago",
    countryCode: "US",
    postalCode: "60652",
    state: "IL",
    phone: "123.456.7890",
  };

  const [choosenPaymentMethod, setChoosenPaymentMethod] = useState("");
  const paymentMethods: { [index: string]: JSX.Element } = {
    CreditCard: (
      <CreditCard
        requestHeader={requestHeader}
        {...params}
        enableVaulting={true}
        useKount={true}
      />
    ),
    PayPal: (
      <PayPal
        requestHeader={requestHeader}
        flow={"checkout" as FlowType}
        buttonColor={"blue" as ButtonColorOption}
        buttonLabel={"pay" as ButtonLabelOption}
        payLater={true}
        payLaterButtonColor={"blue" as ButtonColorOption}
        locale="en_GB"
        intent={"capture" as Intent}
        useKount={true}
        shape={"pill" as ButtonShapeOption}
        size={"small" as ButtonSizeOption}
        tagline={true}
        height={55}
        //shippingOptions={shippingOptions}
        {...params}
      />
    ),
    PayPalBuyNow: (
      <PayPal
        requestHeader={requestHeader}
        flow={"checkout" as FlowType}
        buttonColor={"blue" as ButtonColorOption}
        buttonLabel={"buynow" as ButtonLabelOption}
        commit={true}
        payLater={false}
        locale="en_GB"
        intent={"capture" as Intent}
        enableShippingAddress={true}
        shippingAddressEditable={false}
        {...params}
      />
    ),
    GooglePay: (
      <GooglePay
        requestHeader={requestHeader}
        totalPriceStatus={"FINAL"}
        googleMerchantId={"merchant-id-from-google"}
        acquirerCountryCode={"DE"}
        environment={"TEST"}
        {...params}
      />
    ),
    Venmo: (
      <Venmo
        requestHeader={requestHeader}
        desktopFlow={"desktopWebLogin"}
        mobileWebFallBack={true}
        paymentMethodUsage={"multi_use"}
        useTestNonce={true}
        setVenmoUserName={(venmoName) => console.log(venmoName)}
        ignoreBowserSupport={true}
        useKount={true}
        {...params}
      />
    ),
    ApplePay: (
      <ApplePay
        requestHeader={requestHeader}
        applePayDisplayName="My Store"
        {...params}
      />
    ),
    ACH: (
      <ACH
        requestHeader={requestHeader}
        mandateText='By clicking ["Checkout"], I authorize Braintree, a service of PayPal, on behalf of [your business name here] (i) to verify my bank account information using bank information and consumer reports and (ii) to debit my bank account.'
        getAchVaultTokenURL={`${ENDPOINT_URL}/payment/getAchVaultToken`}
        useKount={true}
        {...params}
      />
    ),
    Bancontact: (
      <Bancontact
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"EUR"}
        countryCode={"BE"}
        paymentType={"bancontact"}
        useKount={true}
      />
    ),
    P24: (
      <P24
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"EUR"}
        paymentType={"p24"}
        countryCode={"PL"}
        useKount={true}
      />
    ),
    Sofort: (
      <Sofort
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"EUR"}
        paymentType={"sofort"}
        countryCode={"DE"}
        useKount={true}
      />
    ),
    BLIK: (
      <BLIK
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"PLN"}
        countryCode={"PL"}
        paymentType={"blik"}
        useKount={true}
      />
    ),
    MyBank: (
      <MyBank
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"EUR"}
        countryCode={"IT"}
        paymentType={"mybank"}
        useKount={true}
      />
    ),
    EPS: (
      <EPS
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"EUR"}
        countryCode={"AT"}
        paymentType={"eps"}
        useKount={true}
      />
    ),
    Giropay: (
      <Giropay
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"EUR"}
        countryCode={"DE"}
        paymentType={"giropay"}
        useKount={true}
      />
    ),
    Grabpay: (
      <Grabpay
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"SGD"}
        countryCode={"SG"}
        paymentType={"grabpay"}
        useKount={true}
      />
    ),
    iDeal: (
      <IDeal
        requestHeader={requestHeader}
        {...params}
        {...localPaymentParams}
        currencyCode={"EUR"}
        countryCode={"NL"}
        paymentType={"ideal"}
        useKount={true}
      />
    ),
  };

  const [choosenVaultMethod, setChoosenVaultMethod] = useState("");
  const vaultMethods: { [index: string]: JSX.Element } = {
    CreditCardVault: (
      <CreditCard
        requestHeader={requestHeader}
        {...params}
        {...vaultingParams}
      />
    ),
    PayPalVault: (
      <PayPal
        requestHeader={requestHeader}
        flow={"vault" as FlowType}
        buttonColor={"blue" as ButtonColorOption}
        buttonLabel={"paypal" as ButtonLabelOption}
        commit={true}
        payLater={false}
        locale="en_GB"
        intent={"capture" as Intent}
        {...params}
        {...vaultingParams}
      />
    ),
  };
  const changePaymentMethod = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.checked) return;
    setChoosenPaymentMethod(e.target.value);
  };
  const changeVaultMethod = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.checked) return;
    setChoosenVaultMethod(e.target.value);
  };

  return (
    <div className="App">
      {Object.keys(paymentMethods).map((entry, index) => (
        <div key={index}>
          <label>
            <input
              onChange={changePaymentMethod}
              type="radio"
              name="paymentmethod"
              value={entry}
            />
            {entry}
          </label>
        </div>
      ))}
      <div>{paymentMethods[choosenPaymentMethod] ?? <></>}</div>
      <hr />
      <h2>Pure Vaults</h2>
      {Object.keys(vaultMethods).map((entry, index) => (
        <div key={index}>
          <label>
            <input
              onChange={changeVaultMethod}
              type="radio"
              name="vaultmethod"
              value={entry}
            />
            {entry}
          </label>
        </div>
      ))}
      <div>{vaultMethods[choosenVaultMethod] ?? <></>}</div>
    </div>
  );
}

export default App;
