// react-table (used by examples/Tables/DataTable) expects a global
// regeneratorRuntime - CRA's Babel preset injects this automatically,
// Vite/esbuild doesn't, so it needs to be polyfilled explicitly here.
import "regenerator-runtime/runtime";

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
