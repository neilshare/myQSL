import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, afterEach } from "vitest";
import { AppLayout } from "./AppLayout";
import { I18nProvider } from "../lib/i18n";

afterEach(() => {
  cleanup();
});

describe("AppLayout", () => {
  it("renders QRZ.com and eQSL.cc external links in the footer", () => {
    render(
      <MemoryRouter initialEntries={["/admin/qsos"]}>
        <I18nProvider>
          <AppLayout />
        </I18nProvider>
      </MemoryRouter>
    );

    const qrzFooterLink = screen.getByRole("link", { name: /QRZ\.com/i });
    expect(qrzFooterLink).toBeTruthy();
    expect(qrzFooterLink.getAttribute("href")).toBe("https://www.qrz.com");
    expect(qrzFooterLink.getAttribute("target")).toBe("_blank");
    expect(qrzFooterLink.getAttribute("rel")).toContain("noreferrer");

    const eqslFooterLink = screen.getByRole("link", { name: /eQSL\.cc/i });
    expect(eqslFooterLink).toBeTruthy();
    expect(eqslFooterLink.getAttribute("href")).toBe("https://www.eqsl.cc");
    expect(eqslFooterLink.getAttribute("target")).toBe("_blank");
    expect(eqslFooterLink.getAttribute("rel")).toContain("noreferrer");
  });

  it("renders external links in mobile drawer when toggled", () => {
    render(
      <MemoryRouter initialEntries={["/admin/qsos"]}>
        <I18nProvider>
          <AppLayout />
        </I18nProvider>
      </MemoryRouter>
    );

    const menuBtn = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menuBtn);

    const mobileNav = screen.getByLabelText("移动端导航");
    expect(mobileNav).toBeTruthy();

    const qrzMobileLinks = screen.getAllByRole("link", { name: /QRZ\.com/i });
    expect(qrzMobileLinks.length).toBeGreaterThanOrEqual(2); // Footer and Mobile drawer
  });
});
