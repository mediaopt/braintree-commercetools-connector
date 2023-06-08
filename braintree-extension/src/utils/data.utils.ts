export const getCurrentTimestamp = (): string => {
  return new Date().toISOString();
};

export const parseMoney = (
  amount: string,
  fractionDigits: number | undefined
): number => {
  return parseFloat(amount) * Math.pow(10, fractionDigits ?? 0);
};
