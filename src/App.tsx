import { useState } from "react";
import DashboardPage from "./pages/dashboard-stok";
import PenjualanPage from "./pages/penjualan";
import PembelianPage from "./pages/pembelian";

type Tab = "dashboard" | "penjualan" | "pembelian";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="app-shell">
      {/* Header - nav kiri, title kanan */}
      <header className="app-header">
        <nav className="header-nav">
          <button
            className={tab === "dashboard" ? "active" : ""}
            onClick={() => setTab("dashboard")}
          >
            dashboard
          </button>
          <button
            className={tab === "penjualan" ? "active" : ""}
            onClick={() => setTab("penjualan")}
          >
            penjualan
          </button>
          <button
            className={tab === "pembelian" ? "active" : ""}
            onClick={() => setTab("pembelian")}
          >
            pembelian
          </button>
        </nav>
        <div className="header-title">aglafone input</div>
      </header>

      <main className="app-main">
        {tab === "dashboard" && <DashboardPage />}
        {tab === "penjualan" && <PenjualanPage />}
        {tab === "pembelian" && <PembelianPage />}
      </main>
    </div>
  );
}
