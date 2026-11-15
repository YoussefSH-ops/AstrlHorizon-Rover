import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { UiProvider, useUi } from "./components/Ui.jsx";
import { DataProvider } from "./api/DataContext.jsx";
import { applyCfg } from "./lib/config.js";
import "./styles.css";

applyCfg();

function WithData({ children }) {
  const { log } = useUi();
  return <DataProvider onEvent={log}>{children}</DataProvider>;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <UiProvider>
      <WithData><App /></WithData>
    </UiProvider>
  </StrictMode>
);
