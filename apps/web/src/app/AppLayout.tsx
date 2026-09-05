import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useTheme, type Theme } from "../lib/theme";
import { useI18n, type TranslationKey } from "../lib/i18n";

interface NavItemConfig {
  path: string;
  key: TranslationKey;
  icon: string;
}

const NAV_CONFIG: NavItemConfig[] = [
  { path: "/admin/qsos", key: "nav.qsos", icon: "📻" },
  { path: "/admin/cards", key: "nav.cards", icon: "🪪" },
  { path: "/admin/templates", key: "nav.templates", icon: "🎨" },
  { path: "/admin/import", key: "nav.import", icon: "📥" },
  { path: "/admin/settings/stations", key: "nav.stations", icon: "⚙️" },
  { path: "/admin/trash", key: "nav.trash", icon: "🗑️" },
  { path: "/lookup", key: "nav.lookup", icon: "🔍" },
];

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const isPublicCard = location.pathname.startsWith("/c/");

  const THEMES: Array<{ id: Theme; label: string; icon: string }> = [
    { id: "blue", label: t("theme.blue"), icon: "🔵" },
    { id: "white", label: t("theme.white"), icon: "⚪" },
    { id: "claude", label: t("theme.claude"), icon: "🟡" },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-group">
            <NavLink to="/admin/qsos" className="brand-logo" onClick={() => setMobileMenuOpen(false)}>
              <span className="brand-icon">📻</span>
              <span className="brand-text">myQSL</span>
            </NavLink>
            <span className="brand-badge">{t("brand.badge")}</span>
          </div>

          {/* Desktop & Tablet Navigation */}
          <nav className="desktop-nav" aria-label={t("nav.qsos")}>
            {NAV_CONFIG.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{t(item.key)}</span>
              </NavLink>
            ))}
          </nav>

          {/* Header Controls (Theme & Lang Switcher) */}
          <div className="header-controls">
            <div className="theme-selector" role="group" aria-label={t("theme.title")}>
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  className={`theme-pill-btn ${theme === th.id ? "active" : ""}`}
                  onClick={() => setTheme(th.id)}
                  title={`${t("theme.title")}: ${th.label}`}
                  aria-pressed={theme === th.id}
                >
                  <span>{th.icon}</span>
                  <span>{th.label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="lang-toggle-btn"
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              title={t("lang.title")}
              aria-label={t("lang.title")}
            >
              <span>🌐</span>
              <span>{locale === "zh" ? "EN" : "中文"}</span>
            </button>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label={mobileMenuOpen ? t("common.cancel") : "Menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="hamburger-icon">{mobileMenuOpen ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <nav className="mobile-nav" aria-label="移动端导航">
            <div className="mobile-nav-controls">
              <div className="theme-selector" role="group" aria-label={t("theme.title")}>
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    className={`theme-pill-btn ${theme === th.id ? "active" : ""}`}
                    onClick={() => setTheme(th.id)}
                    aria-pressed={theme === th.id}
                  >
                    <span>{th.icon}</span>
                    <span>{th.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="lang-toggle-btn"
                onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              >
                <span>🌐</span>
                <span>{locale === "zh" ? "EN" : "中文"}</span>
              </button>
            </div>

            {NAV_CONFIG.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `mobile-nav-link ${isActive ? "active" : ""}`
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{t(item.key)}</span>
              </NavLink>
            ))}

            <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "0.5rem", paddingTop: "0.5rem" }}>
              <a
                href="https://www.qrz.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mobile-nav-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="nav-icon">🌐</span>
                <span className="nav-label">QRZ.com ↗</span>
              </a>
              <a
                href="https://www.eqsl.cc"
                target="_blank"
                rel="noopener noreferrer"
                className="mobile-nav-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="nav-icon">✉️</span>
                <span className="nav-label">eQSL.cc ↗</span>
              </a>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content Viewport */}
      <main className={`main-container ${isPublicCard ? "public-view" : ""}`}>
        <Outlet />
      </main>

      {/* Global Compact Footer */}
      <footer className="app-footer">
        <div className="footer-inner">
          <span>{t("footer.text")}</span>
          <span className="footer-links">
            <NavLink to="/lookup">{t("footer.lookup")}</NavLink>
            <span className="divider">·</span>
            <a
              href="https://www.qrz.com"
              target="_blank"
              rel="noopener noreferrer"
              title="QRZ Callsign Database & Logbook"
            >
              QRZ.com ↗
            </a>
            <span className="divider">·</span>
            <a
              href="https://www.eqsl.cc"
              target="_blank"
              rel="noopener noreferrer"
              title="eQSL Electronic QSL Card Centre"
            >
              eQSL.cc ↗
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
