import { ChangeEvent, ReactElement, useState } from "react";
import "./App.css";

import { CreditCard } from "./components/CreditCard";
import { GooglePay } from "./components/GooglePay";
import { Venmo } from "./components/Venmo";
import { PayPal } from "./components/PayPal";
import { ApplePay } from "./components/ApplePay";
import { ACH } from "./components/ACH";
import {
  Bancontact,
  BLIK,
  EPS,
  Giropay,
  Grabpay,
  IDeal,
  MyBank,
  P24,
  Sofort,
} from "./components/LocalPaymentMethods";
import {
  LineItem,
  LineItemKind,
  PayPalShippingOptions,
  Shipping,
  ShippingAddressOverride,
} from "./types";

import {
  ButtonColorOption,
  ButtonLabelOption,
  ButtonShapeOption,
  ButtonSizeOption,
  FlowType,
  Intent,
} from "paypal-checkout-components";

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

  const lineItems: LineItem[] = [
    {
      name: "Product",
      kind: LineItemKind.Debit,
      quantity: "6",
      unitAmount: "1.00",
      unitOfMeasure: "unit",
      totalAmount: "6.00",
      taxAmount: "0.00",
      discountAmount: "0.00",
      productCode: "54321",
      commodityCode: "98765",
      unitTaxAmount: "",
      description: "",
      url: "",
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

  const params = {
    processorUrl: "https://poc-mediaopt.frontastic.rocks/frontastic/action",
    sessionId: "cfddb93b-66f7-4e5a-b7e1-d44d211eca4b",
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
    isPureVault: true,
  };

  const localPaymentParams = {
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
  const paymentMethods: { [index: string]: ReactElement } = {
    CreditCard: (
      <CreditCard {...params} enableVaulting={true} useKount={true} />
    ),
    PayPal: (
      <PayPal
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
        totalPriceStatus={"FINAL"}
        googleMerchantId={"merchant-id-from-google"}
        acquirerCountryCode={"DE"}
        environment={"TEST"}
        {...params}
      />
    ),
    Venmo: (
      <Venmo
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
    ApplePay: <ApplePay applePayDisplayName="My Store" {...params} />,
    ACH: (
      <ACH
        mandateText='By clicking ["Checkout"], I authorize Braintree, a service of PayPal, on behalf of [your business name here] (i) to verify my bank account information using bank information and consumer reports and (ii) to debit my bank account.'
        useKount={true}
        {...params}
      />
    ),
    Bancontact: (
      <Bancontact
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
  const vaultMethods: { [index: string]: ReactElement } = {
    CreditCardVault: <CreditCard {...params} {...vaultingParams} />,
    PayPalVault: (
      <PayPal
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
  const changePaymentMethod = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.checked) return;
    setChoosenPaymentMethod(e.target.value);
  };
  const changeVaultMethod = (e: ChangeEvent<HTMLInputElement>) => {
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
