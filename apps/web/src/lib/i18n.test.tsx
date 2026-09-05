import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { I18nProvider, useI18n } from "./i18n";

function TestComponent() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="current-locale">{locale}</span>
      <span data-testid="nav-qsos">{t("nav.qsos")}</span>
      <span data-testid="theme-claude">{t("theme.claude")}</span>
      <button onClick={() => setLocale("en")}>Set English</button>
      <button onClick={() => setLocale("zh")}>Set Chinese</button>
    </div>
  );
}

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: storageMock,
  writable: true,
  configurable: true,
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: storageMock,
    writable: true,
    configurable: true,
  });
}

describe("i18n System", () => {
  beforeEach(() => {
    storageMock.clear();
    document.documentElement.removeAttribute("lang");
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to zh (Chinese) and sets html lang attribute", () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    expect(screen.getByTestId("current-locale").textContent).toBe("zh");
    expect(screen.getByTestId("nav-qsos").textContent).toBe("QSO 日志");
    expect(screen.getByTestId("theme-claude").textContent).toBe("典雅黄");
    expect(document.documentElement.getAttribute("lang")).toBe("zh");
  });

  it("switches to English and persists in localStorage", () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Set English" }));
    expect(screen.getByTestId("current-locale").textContent).toBe("en");
    expect(screen.getByTestId("nav-qsos").textContent).toBe("QSO Logs");
    expect(screen.getByTestId("theme-claude").textContent).toBe("Elegant Amber");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(localStorage.getItem("myqsl_locale")).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: "Set Chinese" }));
    expect(screen.getByTestId("current-locale").textContent).toBe("zh");
    expect(screen.getByTestId("nav-qsos").textContent).toBe("QSO 日志");
    expect(screen.getByTestId("theme-claude").textContent).toBe("典雅黄");
    expect(document.documentElement.getAttribute("lang")).toBe("zh");
    expect(localStorage.getItem("myqsl_locale")).toBe("zh");
  });
});
