import { expect } from "@jest/globals";
import {
  BRAINTREE_PAYMENT_TYPE_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  apiCallNameToFieldData,
  resolveTypeKey,
  toFieldDefinition,
} from "../index";

describe("resolveTypeKey", () => {
  const envVar = "PAYMENT_TYPE_KEY";
  const originalValue = process.env[envVar];

  afterEach(() => {
    if (originalValue === undefined) delete process.env[envVar];
    else process.env[envVar] = originalValue;
  });

  test("returns the default key when no env override is set", () => {
    delete process.env[envVar];
    expect(resolveTypeKey(BRAINTREE_PAYMENT_TYPE_KEY)).toBe(
      BRAINTREE_PAYMENT_TYPE_KEY
    );
  });

  test("returns the env override when set", () => {
    process.env[envVar] = "custom-payment-type";
    expect(resolveTypeKey(BRAINTREE_PAYMENT_TYPE_KEY)).toBe(
      "custom-payment-type"
    );
  });
});

describe("apiCallNameToFieldData", () => {
  test("defaults to the extension's own Request/Response field pair", () => {
    expect(apiCallNameToFieldData("refund")).toEqual([
      { name: "refundRequest", inputHint: "MultiLine" },
      { name: "refundResponse", inputHint: "MultiLine" },
    ]);
  });

  test("builds processor's own ProcessorRequest field, sharing the Response field", () => {
    expect(apiCallNameToFieldData("refund", true)).toEqual([
      { name: "refundProcessorRequest", inputHint: "MultiLine" },
      { name: "refundResponse", inputHint: "MultiLine" },
    ]);
  });
});

describe("toFieldDefinition", () => {
  test("defaults label to the field name and type to String", () => {
    expect(toFieldDefinition({ name: "someField" })).toEqual({
      name: "someField",
      label: { en: "someField" },
      type: { name: "String" },
      inputHint: undefined,
      required: false,
    });
  });

  test("respects explicit label/typeName/inputHint", () => {
    expect(
      toFieldDefinition({
        name: BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
        label: { en: "custom label" },
        typeName: "DateTime",
        inputHint: "SingleLine",
      })
    ).toEqual({
      name: BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
      label: { en: "custom label" },
      type: { name: "DateTime" },
      inputHint: "SingleLine",
      required: false,
    });
  });
});
