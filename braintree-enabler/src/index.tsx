// react 19

import { createRoot } from "react-dom/client";
import App from "./App";
import { StrictMode } from "react";

const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
