export const invalidDataLog = (invalidProps: (string | boolean)[], message?: string) =>
  `${message || "Missing "} ${invalidProps.filter(Boolean).join(" and ")}.`;
