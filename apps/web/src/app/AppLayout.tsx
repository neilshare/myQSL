import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

const NAV_ITEMS = [
  { path: "/admin/qsos", label: "QSO 日志", icon: "📻" },
  { path: "/admin/cards", label: "卡片管理", icon: "🪪" },
  { path: "/admin/templates", label: "模板设计", icon: "🎨" },
  { path: "/admin/import", label: "ADIF 导入", icon: "📥" },
  { path: "/admin/settings/stations", label: "台站设置", icon: "⚙️" },
  { path: "/admin/trash", label: "回收站", icon: "🗑️" },
  { path: "/lookup", label: "索卡查验", icon: "🔍" },
];

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isPublicCard = location.pathname.startsWith("/c/");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-group">
            <NavLink to="/admin/qsos" className="brand-logo" onClick={() => setMobileMenuOpen(false)}>
              <span className="brand-icon">📻</span>
              <span className="brand-text">myQSL</span>
            </NavLink>
            <span className="brand-badge">HAM Core</span>
          </div>

          {/* Desktop & Tablet Navigation */}
          <nav className="desktop-nav" aria-label="主导航">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="mobile-menu-btn"
            aria-label={mobileMenuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="hamburger-icon">{mobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <nav className="mobile-nav" aria-label="移动端导航">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `mobile-nav-link ${isActive ? "active" : ""}`
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
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
          <span>myQSL — 业余无线电电子 QSL 卡片与通联系统</span>
          <span className="footer-links">
            <NavLink to="/lookup">公开查验</NavLink>
            <span className="divider">·</span>
            <a href="https://myqsl.app" target="_blank" rel="noreferrer">官方文档</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
