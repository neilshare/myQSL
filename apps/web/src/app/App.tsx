import { RouterProvider } from "react-router";
import { router } from "./router";
import { ThemeProvider } from "../lib/theme";
import { I18nProvider } from "../lib/i18n";
import "./styles.css";

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </ThemeProvider>
  );
}
