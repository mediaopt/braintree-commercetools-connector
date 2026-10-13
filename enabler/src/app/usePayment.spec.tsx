import { render, waitFor } from "@testing-library/react";

const mockProcessorRequest = jest.fn();
jest.mock("../services/processorRequest", () => ({
  processorRequest: (...args: unknown[]) => mockProcessorRequest(...args),
}));

import { PaymentProvider, usePayment } from "./usePayment";

describe("usePayment — handleTransactionSale", () => {
  let handleTransactionSale:
    ReturnType<typeof usePayment>["handleTransactionSale"] | undefined;

  const CaptureSale = () => {
    handleTransactionSale = usePayment().handleTransactionSale;
    return null;
  };

  beforeEach(async () => {
    handleTransactionSale = undefined;
    mockProcessorRequest.mockReset().mockResolvedValueOnce({
      braintreeData: { clientToken: "client-token", braintreeCustomerId: "" },
      payment: {
        ctPaymentId: "payment-id",
        braintreeAmount: 10,
        currency: "USD",
      },
    });
    render(
      <PaymentProvider
        processorUrl="https://processor.example.com"
        sessionId="session-id"
        paymentMethodType="CreditCard"
        purchaseCallback={jest.fn()}
      >
        <CaptureSale />
      </PaymentProvider>,
    );
    await waitFor(() => expect(handleTransactionSale).toBeDefined());
  });

  it("rejects with TRANSACTION_SALE_FAILED, not the processor's message, when the sale fails", async () => {
    mockProcessorRequest.mockResolvedValueOnce({
      success: false,
      message: "Declined for 1 Private Street",
    });

    await expect(handleTransactionSale!("nonce")).rejects.toMatchObject({
      code: "TRANSACTION_SALE_FAILED",
      message: "The payment could not be completed.",
    });
  });
});
