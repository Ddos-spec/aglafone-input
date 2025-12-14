import { useState } from "react";
import DashboardPage from "./pages/dashboard-stok";
import PenjualanPage from "./pages/penjualan";
import PembelianPage from "./pages/pembelian";

type Tab = "dashboard" | "penjualan" | "pembelian";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="app-shell">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>
          Aglafone Input
        </h1>
        <p className="muted">Dashboard stok, penjualan, dan pembelian</p>
      </header>

      <nav className="nav">
        <button
          className={tab === "dashboard" ? "active" : ""}
          onClick={() => setTab("dashboard")}
        >
          Dashboard Stok
        </button>
        <button
          className={tab === "penjualan" ? "active" : ""}
          onClick={() => setTab("penjualan")}
        >
          Penjualan
        </button>
        <button
          className={tab === "pembelian" ? "active" : ""}
          onClick={() => setTab("pembelian")}
        >
          Pembelian
        </button>
      </nav>

      {tab === "dashboard" && <DashboardPage />}
      {tab === "penjualan" && <PenjualanPage />}
      {tab === "pembelian" && <PembelianPage />}
    </div>
  );
}
