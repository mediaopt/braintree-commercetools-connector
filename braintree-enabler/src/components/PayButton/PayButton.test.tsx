import React from "react";
import { render, screen } from "@testing-library/react";
import { PayButton, PAY_BUTTON_TEXT_FALLBACK } from "./PayButton";

test("button has default text", () => {
  render(<PayButton disabled={false} />);
  const linkElement = screen.getByText(new RegExp(PAY_BUTTON_TEXT_FALLBACK));
  expect(linkElement).toBeInTheDocument();
});

test("button has custom text", () => {
  const TEXT: string = "custom text";
  render(<PayButton disabled={false} buttonText={TEXT} />);
  const linkElement = screen.getByText(new RegExp(TEXT));
  expect(linkElement).toBeInTheDocument();
});

test("button should be disabled", () => {
  render(<PayButton disabled={true} />);
  const linkElement = screen.getByRole("button");
  expect(linkElement).toBeDisabled();
});

test("button should not be disabled", () => {
  render(<PayButton disabled={false} />);
  const linkElement = screen.getByRole("button");
  expect(linkElement).toBeEnabled();
});

test("button should be full width", () => {
  render(<PayButton disabled={false} fullWidth={true} />);
  const linkElement = screen.getByRole("button");
  expect(linkElement).toHaveClass("w-full");
});
