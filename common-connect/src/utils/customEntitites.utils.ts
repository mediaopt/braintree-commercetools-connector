import { BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY } from "../constants";
import { getCurrentTimestamp } from "./data.utils";
import { CustomFieldsDraft } from "@commercetools/connect-payments-sdk";
import { MessageFieldData } from "../types/index.types";

export const stringifyData = (data: string | object) => {
  return typeof data === "string" ? data : JSON.stringify(data);
};

export const handleInterfaceInteraction = ({
  messageName,
  message,
  messageType,
}: MessageFieldData): CustomFieldsDraft => ({
  type: {
    typeId: "type",
    key: BRAINTREE_PAYMENT_INTERACTION_TYPE_KEY,
  },
  fields: {
    type: messageName + messageType,
    data: stringifyData(message),
    timestamp: getCurrentTimestamp(),
  },
});
