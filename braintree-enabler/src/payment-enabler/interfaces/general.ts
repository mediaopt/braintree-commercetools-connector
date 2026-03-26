export type OnComplete = (opts: {
  isSuccess: boolean;
  paymentReference: string;
  method: {
    type: string;
  };
}) => void;

export type CTAmount = {
  centAmount: number;
  currencyCode: string;
  fractionDigits: number;
};
