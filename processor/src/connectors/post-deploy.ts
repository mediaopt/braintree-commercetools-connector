import * as dotenv from 'dotenv';
dotenv.config();

import { TypeDraft } from '@commercetools/platform-sdk';
import {
  apiCallNameToFieldData,
  CUSTOM_TYPE_DESCRIPTORS,
  CustomTypeShape,
  FieldDefinitionData,
  BRAINTREE_PAYMENT_TYPE_KEY,
  BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  PAYMENT_INTERACTION_TYPE_FIELDS,
  toFieldDefinition,
} from 'common-connect/dist';
import { paymentSDK } from '../payment-sdk';
import { getConfig } from '../config/config';

// The endpoint names processor itself calls Braintree with (see braintree-payment.service.ts's
// updatePaymentWithTransaction/handleCustomFieldResponse usage) — the only ones it needs its own
// ProcessorRequest field for. Everything else on braintree-payment-type (Request fields, and
// endpoints processor never calls) stays braintree-extension's own post-deploy's job.
const PROCESSOR_PAYMENT_API_CALL_NAMES = [
  'getClientToken',
  'transactionSale',
  'submitForSettlement',
  'refund',
  'void',
];

const LOCAL_PAYMENT_METHODS_PAYMENT_ID_FIELD: FieldDefinitionData = {
  name: 'LocalPaymentMethodsPaymentId',
  label: {
    en: 'Payment Id of a local payment method (Bancontact, iDEAL, ...)',
    de: 'Payment Id einer lokalen Zahlungsart (Bancontact, iDEAL, ...)',
  },
};

const BRAINTREE_ORDER_ID_FIELD: FieldDefinitionData = {
  name: 'BraintreeOrderId',
  label: { en: 'Order Id', de: 'Bestellnummer' },
};

// Builds the TypeDraft processor itself needs for one custom type shared with extension's own
// response logs. The actual create-if-missing/add-missing-fields orchestration is provided by
// paymentSDK.ctCustomTypeService.createOrUpdate(). Never touches any of braintree-extension's own
// fields — those stay the extension's job.
const buildTypeDraft = (
  key: string,
  { name, resourceTypeIds }: CustomTypeShape,
  fields: FieldDefinitionData[]
): TypeDraft => ({
  key,
  name,
  resourceTypeIds,
  fieldDefinitions: fields.map(toFieldDefinition),
});

/**
 * Ensures the custom types processor writes into on every request already exist, with the fields
 * processor itself needs — so processor no longer implicitly depends on braintree-extension's
 * post-deploy having already run/succeeded first (see connectors/post-deploy.ts's previous
 * no-op and the comment this replaced).
 */
async function ensureProcessorFields(): Promise<void> {
  const typeSpecs: {
    typeKey: string;
    shape: CustomTypeShape;
    fields: FieldDefinitionData[];
  }[] = [
    {
      typeKey: getConfig().paymentTypeKey,
      shape: CUSTOM_TYPE_DESCRIPTORS[BRAINTREE_PAYMENT_TYPE_KEY],
      fields: [
        LOCAL_PAYMENT_METHODS_PAYMENT_ID_FIELD,
        BRAINTREE_ORDER_ID_FIELD,
        ...PROCESSOR_PAYMENT_API_CALL_NAMES.flatMap((name) =>
          apiCallNameToFieldData(name, true)
        ),
      ],
    },
    {
      typeKey: getConfig().interactionTypeKey,
      shape: CUSTOM_TYPE_DESCRIPTORS[BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY],
      fields: PAYMENT_INTERACTION_TYPE_FIELDS,
    },
  ];

  await Promise.all(
    typeSpecs.map(({ typeKey, shape, fields }) =>
      paymentSDK.ctCustomTypeService.createOrUpdate(
        buildTypeDraft(typeKey, shape, fields)
      )
    )
  );
}

async function runPostDeployScripts() {
  try {
    await ensureProcessorFields();
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`Post-deploy failed: ${error.message}\n`);
    }
    process.exitCode = 1;
  }
}

runPostDeployScripts();
