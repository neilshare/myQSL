import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

function TestComponent() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button onClick={() => setTheme("white")}>Set White</button>
      <button onClick={() => setTheme("claude")}>Set Claude</button>
      <button onClick={() => setTheme("blue")}>Set Blue</button>
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

describe("Theme System", () => {
  beforeEach(() => {
    storageMock.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to blue theme and sets data-theme attribute on root", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("current-theme").textContent).toBe("blue");
    expect(document.documentElement.getAttribute("data-theme")).toBe("blue");
  });

  it("switches to white and claude themes, persisting to localStorage", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Set White" }));
    expect(screen.getByTestId("current-theme").textContent).toBe("white");
    expect(document.documentElement.getAttribute("data-theme")).toBe("white");
    expect(localStorage.getItem("myqsl_theme")).toBe("white");

    fireEvent.click(screen.getByRole("button", { name: "Set Claude" }));
    expect(screen.getByTestId("current-theme").textContent).toBe("claude");
    expect(document.documentElement.getAttribute("data-theme")).toBe("claude");
    expect(localStorage.getItem("myqsl_theme")).toBe("claude");

    fireEvent.click(screen.getByRole("button", { name: "Set Blue" }));
    expect(screen.getByTestId("current-theme").textContent).toBe("blue");
    expect(document.documentElement.getAttribute("data-theme")).toBe("blue");
    expect(localStorage.getItem("myqsl_theme")).toBe("blue");
  });
});
