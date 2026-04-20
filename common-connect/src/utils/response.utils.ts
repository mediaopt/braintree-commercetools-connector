import { CustomerSetCustomFieldAction } from "@commercetools/platform-sdk";

import { CustomerResponse, UpdateActions } from "../types/index.types";
import { stringifyData } from "./customEntitites.utils";

export const removeEmptyProperties = (response: any) => {
  for (const prop in response) {
    if (response[prop] === null) {
      delete response[prop];
    }
    if (typeof response[prop] === "object") {
      removeEmptyProperties(response[prop]);
      if (Object.keys(response[prop]).length === 0) {
        delete response[prop];
      }
    }
  }
};

export const handleCustomerResponse = (
  requestName: string,
  response: CustomerResponse | string,
  isExistingBraintreeCustomer?: boolean,
): CustomerSetCustomFieldAction[] => {
  const updateActions: CustomerSetCustomFieldAction[] = [];
  if (typeof response === "object") {
    removeEmptyProperties(response);
  }
  updateActions.push({
    action: "setCustomField",
    name: `${requestName}Response`,
    value: stringifyData(response),
  });
  updateActions.push({
    action: "setCustomField",
    name: `${requestName}Request`,
    value: null,
  });
  if (
    !isExistingBraintreeCustomer &&
    typeof response === "object" &&
    "id" in response &&
    response.id
  ) {
    updateActions.push({
      action: "setCustomField",
      name: "braintreeCustomerId",
      value: response.id,
    });
  }
  return updateActions;
};
