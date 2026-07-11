import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { NetworkProvider } from "./auth/NetworkContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <NetworkProvider>
      <App />
    </NetworkProvider>
  </AuthProvider>,
);
