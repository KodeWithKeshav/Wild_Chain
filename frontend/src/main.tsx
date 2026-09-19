import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { Web3Provider } from "./context/Web3Context";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Web3Provider>
      <HashRouter>
        <App />
      </HashRouter>
    </Web3Provider>
  </React.StrictMode>,
);
