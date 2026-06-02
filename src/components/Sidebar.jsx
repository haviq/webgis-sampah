import { supabase } from "../lib/supabase";

export default function Sidebar({ user, role, activeTab, setActiveTab, isCollapsed, setIsCollapsed, menuItems }) {
  const logout = async () => {
    await supabase.auth.signOut();
  };

  const getSidebarBrandIcon = () => {
    if (role === "admin") {
      return (
        <svg style={{ width: '22px', height: '22px', color: '#10b981', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    }
    if (role === "transporter") {
      return (
        <svg style={{ width: '22px', height: '22px', color: '#f59e0b', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h4m-6 0a1 1 0 001-1m-6 0H9" />
        </svg>
      );
    }
    return (
      <svg style={{ width: '22px', height: '22px', color: '#10b981', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    );
  };

  const getBrandTitle = () => {
    if (role === "admin") return "WEBGIS ADMIN";
    if (role === "transporter") return "TRANSPORTER";
    return "ECO WARGA";
  };

  const getAvatarColor = () => {
    if (role === "admin") return "#1e293b";
    if (role === "transporter") return "#d97706";
    return "#059669";
  };

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`} style={{ overflowY: "auto", overflowX: "hidden" }}>
      
      {/* Brand Header: icon + title + toggle in ONE row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        marginBottom: "32px",
        minHeight: "36px",
      }}>
        {/* Icon + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
          {getSidebarBrandIcon()}
          {!isCollapsed && (
            <span style={{
              fontSize: "13px",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "0.8px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {getBrandTitle()}
            </span>
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Buka Sidebar" : "Tutup Sidebar"}
          style={{
            background: "transparent",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "color 0.15s ease, background-color 0.15s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.backgroundColor = "#1e293b"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isCollapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
          </svg>
        </button>
      </div>

      {/* Navigation Menu */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
        {menuItems.map((item) => (
          <li
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            title={isCollapsed ? item.label : ""}
            style={{
              display: "flex",
              alignItems: "center",
              gap: isCollapsed ? 0 : "10px",
              justifyContent: isCollapsed ? "center" : "flex-start",
              padding: isCollapsed ? "10px" : "10px 12px",
              borderRadius: "6px",
              marginBottom: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === item.id ? "#ffffff" : "#94a3b8",
              backgroundColor: activeTab === item.id ? "var(--color-primary)" : "transparent",
              transition: "background-color 0.15s ease, color 0.15s ease",
            }}
            onMouseEnter={e => {
              if (activeTab !== item.id) {
                e.currentTarget.style.backgroundColor = "#1e293b";
                e.currentTarget.style.color = "#ffffff";
              }
            }}
            onMouseLeave={e => {
              if (activeTab !== item.id) {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "#94a3b8";
              }
            }}
          >
            {/* Icon */}
            <span style={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              width: "18px",
              height: "18px",
              color: "inherit",
            }}>
              {item.icon}
            </span>
            {/* Label */}
            {!isCollapsed && (
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Footer: user info + logout */}
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: "16px", marginTop: "auto" }}>
        {/* User Info */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: isCollapsed ? "0" : "0 8px",
          marginBottom: "12px",
          justifyContent: isCollapsed ? "center" : "flex-start",
        }}>
          <div style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: getAvatarColor(),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "13px",
            color: "#ffffff",
            flexShrink: 0,
          }}>
            {(user?.nama || user?.name || "?").charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.nama || user?.name || "Anonim"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "capitalize" }}>
                {role}
              </div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          style={{
            width: "100%",
            padding: isCollapsed ? "8px" : "8px 12px",
            backgroundColor: "transparent",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#f87171",
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "background-color 0.15s ease, border-color 0.15s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.1)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = "#334155"; }}
        >
          <svg style={{ width: '15px', height: '15px', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!isCollapsed && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  );
}
