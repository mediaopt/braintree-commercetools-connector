import { FieldDefinition, LocalizedString } from "@commercetools/platform-sdk";
import {
  BRAINTREE_PAYMENT_TYPE_KEY,
  BRAINTREE_CUSTOMER_TYPE_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY,
} from "./constants";

export type BraintreeCustomTypeKeys =
  | typeof BRAINTREE_PAYMENT_TYPE_KEY
  | typeof BRAINTREE_CUSTOMER_TYPE_KEY
  | typeof BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY
  | typeof BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY;

export type FieldDefinitionData = {
  name: string;
  label?: LocalizedString;
  typeName?: "String" | "DateTime";
  inputHint?: "SingleLine" | "MultiLine";
};

export type CustomTypeShape = {
  name: LocalizedString;
  resourceTypeIds: string[];
};

// name/resourceTypeIds describe the type's shape; envVarName is the env var a merchant can use to
// override its key (see resolveTypeKey). CustomTypeShape is exported separately for consumers that
// build a real commercetools TypeDraft — they should pick just those two fields, not spread the
// whole descriptor, so envVarName (internal bookkeeping) never leaks into an actual CT API payload.
export const CUSTOM_TYPE_DESCRIPTORS: Record<
  BraintreeCustomTypeKeys,
  CustomTypeShape & { envVarName: string }
> = {
  [BRAINTREE_PAYMENT_TYPE_KEY]: {
    name: { en: "Custom payment type to braintree fields" },
    resourceTypeIds: ["payment"],
    envVarName: "PAYMENT_TYPE_KEY",
  },
  [BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY]: {
    name: { en: "Custom payment interaction type to braintree fields" },
    resourceTypeIds: ["payment-interface-interaction"],
    envVarName: "PAYMENT_INTERACTION_TYPE_KEY",
  },
  [BRAINTREE_PAYMENT_TRANSACTION_TYPE_KEY]: {
    name: { en: "Custom payment transaction type to braintree fields" },
    resourceTypeIds: ["transaction"],
    envVarName: "PAYMENT_TRANSACTION_TYPE_KEY",
  },
  [BRAINTREE_CUSTOMER_TYPE_KEY]: {
    name: { en: "Custom customer type to braintree fields" },
    resourceTypeIds: ["customer"],
    envVarName: "CUSTOMER_TYPE_KEY",
  },
};

// The one place this env-var-override-else-default resolution is implemented — both
// braintree-extension's connector/actions.ts and processor's config.ts call this.
export const resolveTypeKey = (defaultKey: BraintreeCustomTypeKeys): string =>
  process.env[CUSTOM_TYPE_DESCRIPTORS[defaultKey].envVarName] || defaultKey;

export const PAYMENT_INTERACTION_TYPE_FIELDS: FieldDefinitionData[] = [
  { name: "type", inputHint: "SingleLine" },
  { name: "data", inputHint: "MultiLine" },
  { name: "timestamp", typeName: "DateTime" },
];

// Builds the Request/Response field pair for one braintree API call. The response field name is
// always shared with braintree-extension, so a call processor made can still be read/fine-tuned
// via the extension afterward from one unified field. The request field name differs when
// isProcessor is true — processor must never write the extension's own "${apiCallName}Request"
// name, since that's exactly what the extension's CT Extension trigger fires on.
export const apiCallNameToFieldData = (
  apiCallName: string,
  isProcessor = false
): FieldDefinitionData[] => [
  {
    name: `${apiCallName}${isProcessor ? "ProcessorRequest" : "Request"}`,
    inputHint: "MultiLine",
  },
  { name: `${apiCallName}Response`, inputHint: "MultiLine" },
];

export const toFieldDefinition = (
  spec: FieldDefinitionData
): FieldDefinition => ({
  name: spec.name,
  label: spec.label ?? { en: spec.name },
  type: { name: spec.typeName ?? "String" },
  inputHint: spec.inputHint,
  required: false,
});
