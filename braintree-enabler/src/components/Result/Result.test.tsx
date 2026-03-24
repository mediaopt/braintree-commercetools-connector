import React from "react";
import { render, screen } from "@testing-library/react";
import { Result } from "./Result";

const TEXT: string = "My Text";

test("default success has default message", () => {
  render(<Result />);
  const linkElement = screen.getByText(/Thank you for your purchase!/i);
  expect(linkElement).toBeInTheDocument();
});

test("custom success message gets shown", () => {
  render(<Result message={TEXT} />);
  const linkElement = screen.getByText(new RegExp(TEXT));
  expect(linkElement).toBeInTheDocument();
});

test("successful result has success classes", () => {
  const { container } = render(<Result />);
  // @ts-ignore
  expect(container.firstChild.className === "text-green-700");
});

test("unsuccessful result has failure classes", () => {
  const { container } = render(<Result />);
  // @ts-ignore
  expect(container.firstChild.className === "text-rose-600");
});

test("result component displays children", () => {
  const { container } = render(
    <Result>
      <label>{TEXT}</label>
    </Result>
  );
  const linkElement = container.querySelector("label");
  expect(linkElement).toBeInTheDocument();
});
