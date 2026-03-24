import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

test("CreditCard is shown", () => {
  render(<App />);
  const linkElement = screen.getAllByText(/CreditCard/i);
  expect(linkElement.length).toEqual(2);
});

test("PayPal is shown", () => {
  render(<App />);
  const linkElement = screen.getAllByText(/PayPal/i);
  expect(linkElement.length).toEqual(3);
});

test("GooglePay is shown", () => {
  render(<App />);
  const linkElement = screen.getByText(/GooglePay/i);
  expect(linkElement).toBeInTheDocument();
});

test("Venmo is shown", () => {
  render(<App />);
  const linkElement = screen.getByText(/Venmo/i);
  expect(linkElement).toBeInTheDocument();
});

test("ApplePay is shown", () => {
  render(<App />);
  const linkElement = screen.getByText(/ApplePay/i);
  expect(linkElement).toBeInTheDocument();
});

test("ACH is shown", () => {
  render(<App />);
  const linkElement = screen.getByText(/ACH/i);
  expect(linkElement).toBeInTheDocument();
});
