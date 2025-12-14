import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { exportSalesCSV } from "../lib/export";
import { formatIDR, useStockStore } from "../lib/stockStore";
import type { SaleItem, SaleTransaction, StockItem } from "../lib/types";

type SaleForm = {
  customer: string;
  tanggal: string;
  items: {
    kode: string;
    nama: string;
    warna: string;
    qty: number;
    hargaJual: number;
    subtotal: number;
  }[];
};

type Toast = { id: number; message: string; tone: "success" | "error" };

const defaultValues: SaleForm = {
  customer: "",
  tanggal: new Date().toISOString().slice(0, 10),
  items: [
    {
      kode: "",
      nama: "",
      warna: "",
      qty: 1,
      hargaJual: 0,
      subtotal: 0,
    },
  ],
};

const mockHistory: SaleTransaction[] = [
  {
    id: "SALES-001",
    customer: "Andi",
    timestamp: "2025-12-15T14:30:00.000Z",
    total: 2100000,
    items: [
      { kode: "SKU-001", nama: "Headset A", warna: "Hitam", qty: 3, hargaJual: 175000, subtotal: 525000 },
      { kode: "SKU-002", nama: "Charger C", warna: "Hitam", qty: 5, hargaJual: 75000, subtotal: 375000 },
      { kode: "SKU-003", nama: "Cable Fast", warna: "Merah", qty: 20, hargaJual: 40000, subtotal: 800000 },
    ],
  },
  {
    id: "SALES-002",
    customer: "Budi",
    timestamp: "2025-12-15T10:00:00.000Z",
    total: 750000,
    items: [{ kode: "SKU-001", nama: "Headset A", warna: "Putih", qty: 3, hargaJual: 250000, subtotal: 750000 }],
  },
];

export default function PenjualanPage() {
  const { items: stock, applySale } = useStockStore();
  const form = useForm<SaleForm>({ defaultValues });
  const { fields, append, remove, update } = useFieldArray<SaleForm, "items">({
    control: form.control,
    name: "items",
  });
  const [queries, setQueries] = useState<string[]>([""]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastTx, setLastTx] = useState<SaleTransaction | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [history, setHistory] = useState<SaleTransaction[]>(mockHistory);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);

  useEffect(() => {
    setQueries(new Array(fields.length).fill(""));
  }, [fields.length]);

  const watchedItems = (form.watch("items") as SaleForm["items"]) || [];
  const grandTotal = watchedItems.reduce(
    (sum: number, it: SaleForm["items"][number]) => sum + (it.subtotal || 0),
    0,
  );

  const invalidQty = watchedItems.some((it: SaleForm["items"][number]) => {
    const stok = stock.find((s) => s.kode === it.kode);
    return stok && it.qty > stok.qty;
  });

  function pushToast(message: string, tone: "success" | "error") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

  function filteredStock(query: string) {
    return stock
      .filter(
        (s) =>
          s.kode.toLowerCase().includes(query.toLowerCase()) ||
          s.nama.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, 10);
  }

  function selectStock(rowIdx: number, item: StockItem | undefined) {
    if (!item) return;
    update(rowIdx, {
      ...fields[rowIdx],
      kode: item.kode,
      nama: item.nama,
      warna: item.variantStock?.[0]?.name || item.warna[0] || "",
      hargaJual: item.hargaJual,
      qty: 1,
      subtotal: item.hargaJual,
    });
  }

  function handleQtyChange(idx: number, qty: number) {
    const current = form.getValues(`items.${idx}`);
    const stok = stock.find((s) => s.kode === current.kode);
    const safeQty = Math.max(0, Math.min(qty, stok?.qty ?? qty));
    update(idx, {
      ...current,
      qty: safeQty,
      subtotal: safeQty * (current.hargaJual || 0),
    });
  }

  function handleHargaChange(idx: number, hargaJual: number) {
    const current = form.getValues(`items.${idx}`);
    update(idx, {
      ...current,
      hargaJual,
      subtotal: (current.qty || 0) * hargaJual,
    });
  }

  function submit(values: SaleForm) {
    if (!values.customer) {
      alert("Customer wajib diisi");
      return;
    }
    if (!values.items.length) {
      alert("Tambahkan minimal 1 item");
      return;
    }
    if (grandTotal <= 0) {
      alert("Total tidak boleh 0");
      return;
    }
    const invalid = values.items.find((it) => {
      const stok = stock.find((s) => s.kode === it.kode);
      return !stok || it.qty > stok.qty;
    });
    if (invalid) {
      pushToast("Gagal menyimpan transaksi! Stok tidak cukup.", "error");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      const txId = `SALES-${Date.now()}`;
      const txItems: SaleItem[] = values.items.map((it) => ({
        ...it,
        subtotal: it.qty * it.hargaJual,
      }));
      const total = txItems.reduce((sum: number, it: SaleItem) => sum + it.subtotal, 0);
      const tx: SaleTransaction = {
        id: txId,
        customer: values.customer || "Umum",
        timestamp: new Date(values.tanggal).toISOString(),
        items: txItems,
        total,
      };
      applySale(tx);
      setHistory((prev) => [tx, ...prev]);
      setLastTx(tx);
      pushToast("Transaksi berhasil disimpan!", "success");
      form.reset({
        ...defaultValues,
        tanggal: new Date().toISOString().slice(0, 10),
      });
      setSaving(false);
    }, 1800);
  }

  function handlePrint() {
    if (lastTx) generatePDF(lastTx);
  }

  function refreshHistory() {
    setHistoryRefreshing(true);
    setTimeout(() => setHistoryRefreshing(false), 1000);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <ToastContainer toasts={toasts} />
      <div className="card">
        <div className="flex" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="title">Form Penjualan</div>
            <div className="muted">Multi-item, auto subtotal, PDF struk</div>
          </div>
          <button
            className="btn secondary"
            onClick={() => {
              alert("Export akan tersedia setelah integrasi backend");
              exportSalesCSV([]);
            }}
          >
            Export CSV
          </button>
        </div>
        <div className="divider" />
        <form className="grid" style={{ gap: 12 }} onSubmit={form.handleSubmit(submit)}>
          <div className="grid grid-3">
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Customer</span>
              <input
                className="input"
                placeholder="Nama customer"
                {...form.register("customer")}
              />
            </label>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Tanggal</span>
              <input className="input" type="date" {...form.register("tanggal")} />
            </label>
            <div className="grid" style={{ gap: 4 }}>
              <span className="muted">Grand Total</span>
              <div className="total-box">{formatIDR(grandTotal)}</div>
            </div>
          </div>

          <div className="grid" style={{ gap: 8 }}>
            {fields.map((field: typeof fields[number], idx: number) => {
              const kode = form.watch(`items.${idx}.kode`);
              const stok = stock.find((s) => s.kode === kode);
              const colorOptions =
                stok?.variantStock ||
                stok?.warna.map((w) => ({ name: w, qty: stok?.qty || 0 })) ||
                [];
              const stockText = stok ? `Stok: ${stok.qty} unit` : "Stok: -";
              const stockTone = stok
                ? stok.qty < 5
                  ? "red"
                  : stok.qty <= 10
                    ? "yellow"
                    : "green"
                : "muted";
              return (
                <div key={field.id} className="card" style={{ padding: 12 }}>
                  <div className="flex" style={{ justifyContent: "space-between" }}>
                    <div className="muted">Item #{idx + 1}</div>
                    {fields.length > 1 && (
                      <button className="btn danger" type="button" onClick={() => remove(idx)}>
                        Hapus
                      </button>
                    )}
                  </div>
                  <div
                    className="grid"
                    style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}
                  >
                    <div>
                      <div className="muted">Kode Barang</div>
                      <div style={{ position: "relative" }}>
                        <input
                          className="input"
                          value={form.watch(`items.${idx}.kode`)}
                          onFocus={() => setOpenIdx(idx)}
                          onBlur={() => setTimeout(() => setOpenIdx(null), 150)}
                          onChange={(e) => {
                            form.setValue(`items.${idx}.kode`, e.target.value);
                            setQueries((prev) => {
                              const next = [...prev];
                              next[idx] = e.target.value;
                              return next;
                            });
                            setOpenIdx(idx);
                          }}
                          placeholder="Cari kode atau nama..."
                        />
                        {openIdx === idx && filteredStock(queries[idx] || "").length > 0 && (
                          <div
                            className="card"
                            style={{
                              position: "absolute",
                              top: "110%",
                              left: 0,
                              right: 0,
                              zIndex: 10,
                              maxHeight: 200,
                              overflowY: "auto",
                            }}
                          >
                            {filteredStock(queries[idx] || "").map((item) => (
                              <div
                                key={item.kode}
                                className="muted"
                                style={{ padding: 8, cursor: "pointer" }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  selectStock(idx, item);
                                  setOpenIdx(null);
                                }}
                              >
                                {item.kode} - {item.nama} (Stok: {item.qty})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <label className="grid" style={{ gap: 4 }}>
                      <span className="muted">Nama Barang</span>
                      <input
                        className="input"
                        readOnly
                        style={{ background: "#f1f5f9" }}
                        {...form.register(`items.${idx}.nama`)}
                      />
                    </label>
                    <label className="grid" style={{ gap: 4 }}>
                      <span className="muted">Qty</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={form.watch(`items.${idx}.qty`)}
                        onChange={(e) => handleQtyChange(idx, Number(e.target.value))}
                      />
                      <small className={`small ${stockTone}`}>{stockText}</small>
                      {stok && form.watch(`items.${idx}.qty`) > stok.qty && (
                        <small className="small red">Stok tidak cukup!</small>
                      )}
                    </label>
                    <label className="grid" style={{ gap: 4 }}>
                      <span className="muted">Harga Jual</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={form.watch(`items.${idx}.hargaJual`)}
                        onChange={(e) => handleHargaChange(idx, Number(e.target.value))}
                      />
                    </label>
                    <label className="grid" style={{ gap: 4 }}>
                      <span className="muted">Warna</span>
                      <select className="select" {...form.register(`items.${idx}.warna`)}>
                        <option value="">Pilih warna</option>
                        {colorOptions.map((w) => (
                          <option key={w.name} value={w.name} disabled={w.qty === 0}>
                            {w.name} ({w.qty} unit)
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid" style={{ gap: 4 }}>
                      <span className="muted">Subtotal</span>
                      <div className="title">
                        {formatIDR(form.watch(`items.${idx}.subtotal`) || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              append({
                kode: "",
                nama: "",
                warna: "",
                qty: 1,
                hargaJual: 0,
                subtotal: 0,
              });
              setQueries((q) => [...q, ""]);
            }}
          >
            + Tambah Item
          </button>

          <div className="flex" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="submit"
              disabled={saving || invalidQty}
              style={{ opacity: saving || invalidQty ? 0.7 : 1 }}
            >
              {saving ? "Menyimpan..." : "Submit Transaksi"}
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={handlePrint}
              disabled={!lastTx}
            >
              Cetak Struk PDF
            </button>
          </div>
        </form>
      </div>

      <History
        sales={history}
        onRefresh={refreshHistory}
        refreshing={historyRefreshing}
        onPrint={generatePDF}
        onDelete={(id) => setHistory((prev) => prev.filter((s) => s.id !== id))}
      />
    </div>
  );
}

function History({
  sales,
  refreshing,
  onRefresh,
  onPrint,
  onDelete,
}: {
  sales: SaleTransaction[];
  refreshing: boolean;
  onRefresh: () => void;
  onPrint: (s: SaleTransaction) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="card">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="title">History Penjualan</div>
        <button className="btn secondary" onClick={onRefresh}>
          {refreshing ? "⟳ Refreshing..." : "⟳ Refresh"}
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>No</th>
            <th>Waktu</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {sales.slice(0, 5).map((s, idx) => (
            <tr key={s.id}>
              <td>{idx + 1}</td>
              <td>{formatFriendlyDate(s.timestamp)}</td>
              <td>{s.customer}</td>
              <td>{formatIDR(s.total)}</td>
              <td>
                <div className="table-actions">
                  <button className="btn secondary" onClick={() => alert("Detail mock transaksi")}>
                    👁 Lihat
                  </button>
                  <button className="btn" onClick={() => onPrint(s)}>
                    🖨 Print
                  </button>
                  <button className="btn danger" onClick={() => onDelete(s.id)}>
                    🗑 Hapus
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!sales.length && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: 12 }}>
                Belum ada transaksi.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="table-card">
        {sales.slice(0, 5).map((s, idx) => (
          <div key={s.id} className="card">
            <div className="title">
              {idx + 1}. {s.customer}
            </div>
            <div className="muted small">{formatFriendlyDate(s.timestamp)}</div>
            <div className="muted small">{formatIDR(s.total)}</div>
            <div className="table-actions" style={{ marginTop: 8 }}>
              <button className="btn secondary" onClick={() => alert("Detail mock transaksi")}>
                👁 Lihat
              </button>
              <button className="btn" onClick={() => onPrint(s)}>
                🖨 Print
              </button>
              <button className="btn danger" onClick={() => onDelete(s.id)}>
                🗑 Hapus
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function generatePDF(tx: SaleTransaction) {
  const doc = new jsPDF();
  const now = new Date(tx.timestamp);
  doc.setFontSize(14);
  doc.text("TOKO XYZ", 14, 18);
  doc.setFontSize(10);
  doc.text("Jl. Contoh No. 123", 14, 24);
  doc.text(`No: ${tx.id}`, 14, 30);
  doc.text(`Tanggal: ${now.toLocaleString("id-ID")}`, 14, 36);
  doc.text(`Customer: ${tx.customer}`, 14, 42);

  autoTable(doc, {
    startY: 48,
    head: [["Kode", "Nama", "Qty", "Harga", "Total"]],
    body: tx.items.map((it) => [
      it.kode,
      it.nama,
      String(it.qty),
      formatIDR(it.hargaJual),
      formatIDR(it.subtotal),
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [14, 165, 233] },
  });

  const totalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(12);
  doc.text(`TOTAL: ${formatIDR(tx.total)}`, 14, totalY);
  doc.text("Terima Kasih", 14, totalY + 8);
  doc.save(`${tx.id}.pdf`);
}

function formatFriendlyDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
