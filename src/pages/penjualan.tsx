import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { API_ENDPOINTS, apiCall, apiGet } from "../config/api";
import { exportSalesCSV } from "../lib/export";
import { formatIDR, useStockStore } from "../lib/stockStore";
import type { SaleItem, SaleTransaction, StockItem } from "../lib/types";
import { generatePenjualanId } from "../utils/generateId";
import { isValidDateString, sanitizeNumber, sanitizeString } from "../utils/validation";

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
  const [history, setHistory] = useState<SaleTransaction[]>([]);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setQueries(new Array(fields.length).fill(""));
  }, [fields.length]);

  // Fetch history on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    if (!API_ENDPOINTS.riwayatPenjualan) {
      console.log("[Penjualan] Riwayat endpoint not configured");
      return;
    }
    setHistoryLoading(true);
    try {
      console.log("[Penjualan] Fetching riwayat from:", API_ENDPOINTS.riwayatPenjualan);
      const response = await apiCall<any>(API_ENDPOINTS.riwayatPenjualan, { action: "read" }, { timeoutMs: 20000 });
      const mapped = normalizeSaleHistory(response);
      console.log("[Penjualan] Mapped history:", mapped);
      if (!mapped.length) {
        throw new Error("Data riwayat penjualan kosong dari webhook.");
      }
      setHistory(mapped);
    } catch (error: any) {
      console.error("[Penjualan] Fetch riwayat error:", error);
    } finally {
      setHistoryLoading(false);
    }
  }

  const watchedItems = (form.watch("items") as SaleForm["items"]) || [];
  const grandTotal = watchedItems.reduce((sum: number, it: SaleForm["items"][number]) => {
    const qty = sanitizeNumber(it.qty);
    const harga = sanitizeNumber(it.hargaJual);
    return sum + qty * harga;
  }, 0);

  const invalidQty = watchedItems.some((it: SaleForm["items"][number]) => {
    const stok = stock.find((s) => s.kode === it.kode);
    const qty = sanitizeNumber(it.qty);
    return stok && qty > stok.qty;
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
    // Get first available color or empty if none
    const firstColor = item.variantStock?.[0]?.name || item.warna[0] || "";
    update(rowIdx, {
      ...fields[rowIdx],
      kode: item.kode,
      nama: item.nama,
      warna: firstColor,
      hargaJual: sanitizeNumber(item.hargaJual),
      qty: 1,
      subtotal: sanitizeNumber(item.hargaJual),
    });
  }

  function handleQtyChange(idx: number, qty: number) {
    const current = form.getValues(`items.${idx}`);
    const stok = stock.find((s) => s.kode === current.kode);
    const safeQty = Math.max(0, Math.min(sanitizeNumber(qty), stok?.qty ?? sanitizeNumber(qty)));
    const harga = sanitizeNumber(current.hargaJual);
    update(idx, {
      ...current,
      qty: safeQty,
      subtotal: safeQty * harga,
    });
  }

  function handleHargaChange(idx: number, hargaJual: number) {
    const current = form.getValues(`items.${idx}`);
    const harga = sanitizeNumber(hargaJual);
    const qty = sanitizeNumber(current.qty);
    update(idx, {
      ...current,
      hargaJual: harga,
      subtotal: qty * harga,
    });
  }

  async function submit(values: SaleForm) {
    if (saving) return;
    const customer = sanitizeString(values.customer);
    const tanggal = sanitizeString(values.tanggal);

    if (!API_ENDPOINTS.penjualan) {
      pushToast("Konfigurasi webhook penjualan belum diset.", "error");
      return;
    }

    const errors: string[] = [];
    if (!customer) errors.push("Customer wajib diisi.");
    if (!values.items.length) errors.push("Tambahkan minimal 1 item.");
    if (!isValidDateString(tanggal)) errors.push("Tanggal tidak valid.");

    const itemsPayload = values.items.map((it) => {
      const kode = sanitizeString(it.kode);
      const nama = sanitizeString(it.nama);
      const warna = sanitizeString(it.warna);
      const qty = sanitizeNumber(it.qty);
      const harga = sanitizeNumber(it.hargaJual);

      // Check if item has colors - if yes, warna is required
      const stokItem = stock.find((s) => s.kode === kode);
      const hasColors = stokItem && (stokItem.variantStock?.length || stokItem.warna.length);

      if (!kode || !nama) {
        errors.push("Kode dan nama tiap item wajib diisi.");
      }
      if (hasColors && !warna) {
        errors.push(`Warna untuk ${nama || kode} wajib dipilih.`);
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push("Qty item harus lebih dari 0.");
      }
      if (!Number.isFinite(harga) || harga < 0) {
        errors.push("Harga jual harus berupa angka.");
      }
      return {
        kode_barang: kode,
        nama_barang: nama,
        qty,
        harga_jual: harga,
        warna: warna || "-",
        total: qty * harga,
      };
    });

    const invalidStock = values.items.find((it) => {
      const stok = stock.find((s) => s.kode === it.kode);
      return stok && sanitizeNumber(it.qty) > stok.qty;
    });
    if (invalidStock) {
      errors.push("Stok tidak cukup untuk salah satu item.");
    }

    const total = itemsPayload.reduce((sum, it) => sum + it.total, 0);
    if (total <= 0) errors.push("Total tidak boleh 0.");

    if (errors.length) {
      pushToast(Array.from(new Set(errors)).join(" "), "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: generatePenjualanId(),
        customer,
        tanggal,
        items: itemsPayload,
        total,
        created_at: new Date().toISOString(),
      };
      const response = await apiCall(API_ENDPOINTS.penjualan, payload, { timeoutMs: 30000 });
      if (response && typeof response === "object" && "success" in response && (response as any).success === false) {
        throw new Error((response as any).message || "Gagal menyimpan transaksi!");
      }
      const txItems: SaleItem[] = itemsPayload.map((it) => ({
        kode: it.kode_barang,
        nama: it.nama_barang,
        warna: it.warna,
        qty: it.qty,
        hargaJual: it.harga_jual,
        subtotal: it.total,
      }));
      const tx: SaleTransaction = {
        id: payload.id,
        customer: customer || "Umum",
        timestamp: new Date(tanggal).toISOString(),
        items: txItems,
        total,
      };
      applySale(tx);
      setHistory((prev) => [tx, ...prev]);
      setLastTx(tx);
      pushToast((response as any)?.message || "Transaksi berhasil disimpan!", "success");
      form.reset({
        ...defaultValues,
        tanggal: new Date().toISOString().slice(0, 10),
      });
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Submit Penjualan Error:", error);
      }
      pushToast(error?.message || "Gagal menyimpan transaksi!", "error");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    if (lastTx) generatePDF(lastTx);
  }

  async function refreshHistory() {
    setHistoryRefreshing(true);
    await fetchHistory();
    setHistoryRefreshing(false);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <ToastContainer toasts={toasts} />
      <div className="card">
        <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="title">Form Penjualan</div>
            <div className="muted small">Multi-item, auto subtotal</div>
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

        <form className="grid" style={{ gap: 16 }} onSubmit={form.handleSubmit(submit)}>
          {/* Header Form */}
          <div className="grid" style={{ gap: 16, gridTemplateColumns: "1fr 1fr auto", alignItems: "end" }}>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted small">Customer</span>
              <input
                className="input"
                placeholder="Nama customer"
                {...form.register("customer")}
              />
            </label>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted small">Tanggal</span>
              <input className="input" type="date" {...form.register("tanggal")} />
            </label>
            <div className="grid" style={{ gap: 4 }}>
              <span className="muted small">Grand Total</span>
              <div className="total-box" style={{ fontSize: "1.25rem", fontWeight: 700, color: "#059669" }}>
                {formatIDR(grandTotal)}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="grid" style={{ gap: 12 }}>
            {fields.map((field: typeof fields[number], idx: number) => {
              const kode = form.watch(`items.${idx}.kode`);
              const stok = stock.find((s) => s.kode === kode);
              const colorOptions =
                stok?.variantStock ||
                stok?.warna.map((w) => ({ name: w, qty: stok?.qty || 0 })) ||
                [];
              const hasColors = colorOptions.length > 0;
              const stockQty = stok?.qty ?? 0;
              const stockTone = stockQty < 5 ? "red" : stockQty <= 10 ? "yellow" : "green";

              return (
                <div key={field.id} className="card" style={{ padding: 16, background: "#f8fafc" }}>
                  <div className="flex" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                    <span className="muted small" style={{ fontWeight: 600 }}>Item #{idx + 1}</span>
                    {fields.length > 1 && (
                      <button className="btn danger" type="button" style={{ padding: "4px 12px", fontSize: "0.875rem" }} onClick={() => remove(idx)}>
                        Hapus
                      </button>
                    )}
                  </div>

                  <div className="grid" style={{ gap: 12, gridTemplateColumns: "repeat(6, 1fr)" }}>
                    {/* Kode Barang */}
                    <div style={{ gridColumn: "span 1" }}>
                      <div className="muted small" style={{ marginBottom: 4 }}>Kode Barang</div>
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
                          placeholder="Cari..."
                          style={{ width: "100%" }}
                        />
                        {openIdx === idx && filteredStock(queries[idx] || "").length > 0 && (
                          <div className="card" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, maxHeight: 200, overflowY: "auto", marginTop: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                            {filteredStock(queries[idx] || "").map((item) => (
                              <div
                                key={item.kode}
                                style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #e2e8f0" }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  selectStock(idx, item);
                                  setOpenIdx(null);
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                              >
                                <div style={{ fontWeight: 500 }}>{item.kode}</div>
                                <div className="muted small">{item.nama} (Stok: {item.qty})</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Nama Barang */}
                    <div style={{ gridColumn: "span 2" }}>
                      <div className="muted small" style={{ marginBottom: 4 }}>Nama Barang</div>
                      <input
                        className="input"
                        readOnly
                        style={{ background: "#e2e8f0", width: "100%" }}
                        {...form.register(`items.${idx}.nama`)}
                      />
                    </div>

                    {/* Qty */}
                    <div>
                      <div className="muted small" style={{ marginBottom: 4 }}>Qty</div>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={form.watch(`items.${idx}.qty`)}
                        onChange={(e) => handleQtyChange(idx, Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                      {stok && (
                        <small className={`small ${stockTone}`} style={{ display: "block", marginTop: 2 }}>
                          Stok: {stockQty}
                        </small>
                      )}
                    </div>

                    {/* Harga Jual */}
                    <div>
                      <div className="muted small" style={{ marginBottom: 4 }}>Harga Jual</div>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={form.watch(`items.${idx}.hargaJual`)}
                        onChange={(e) => handleHargaChange(idx, Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>

                    {/* Warna */}
                    <div>
                      <div className="muted small" style={{ marginBottom: 4 }}>Warna</div>
                      {hasColors ? (
                        <select className="select" style={{ width: "100%" }} {...form.register(`items.${idx}.warna`)}>
                          <option value="">Pilih warna</option>
                          {colorOptions.map((w) => (
                            <option key={w.name} value={w.name}>
                              {w.name} ({w.qty})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input"
                          readOnly
                          value="-"
                          style={{ background: "#e2e8f0", width: "100%", textAlign: "center" }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Subtotal */}
                  <div style={{ textAlign: "right", marginTop: 12 }}>
                    <span className="muted small">Subtotal: </span>
                    <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                      {formatIDR(form.watch(`items.${idx}.subtotal`) || 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="btn secondary"
            type="button"
            style={{ width: "100%", padding: "12px" }}
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

          <div className="flex" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button
              className="btn"
              type="submit"
              disabled={saving || invalidQty}
              style={{ padding: "12px 24px" }}
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
        loading={historyLoading}
        onPrint={generatePDF}
        onDelete={(id) => setHistory((prev) => prev.filter((s) => s.id !== id))}
      />
    </div>
  );
}

function History({
  sales,
  refreshing,
  loading,
  onRefresh,
  onPrint,
  onDelete,
}: {
  sales: SaleTransaction[];
  refreshing: boolean;
  loading: boolean;
  onRefresh: () => void;
  onPrint: (s: SaleTransaction) => void;
  onDelete: (id: string) => void;
}) {
  const isLoading = loading || refreshing;
  return (
    <div className="card">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="title">History Penjualan</div>
        <button className="btn secondary" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh"}
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
          {isLoading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <tr key={idx}>
                <td colSpan={5}><div className="skeleton" style={{ height: 20 }} /></td>
              </tr>
            ))
          ) : sales.length > 0 ? (
            sales.slice(0, 10).map((s, idx) => (
              <tr key={s.id}>
                <td>{idx + 1}</td>
                <td>{formatFriendlyDate(s.timestamp)}</td>
                <td>{s.customer}</td>
                <td>{formatIDR(s.total)}</td>
                <td>
                  <div className="table-actions">
                    <button className="btn secondary" onClick={() => onPrint(s)}>Print</button>
                    <button className="btn danger" onClick={() => onDelete(s.id)}>Hapus</button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: 16 }}>
                Belum ada transaksi.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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

function normalizeSaleHistory(payload: any): SaleTransaction[] {
  const raw = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return raw
    .map((row: any, idx: number) => {
      const id = sanitizeString(row?.id || row?.kode_transaksi || row?.kode || `tx-${idx}`);
      if (!id) return null;
      const itemsSource = Array.isArray(row?.items) && row.items.length ? row.items : [row];
      const items: SaleItem[] = itemsSource
        .map((it: any) => {
          const kode = sanitizeString(it?.kode || it?.kode_barang || row?.kode_barang);
          const nama = sanitizeString(it?.nama || it?.nama_barang || row?.nama_barang);
          if (!kode || !nama) return null;
          const warna = sanitizeString(it?.warna || row?.warna || "");
          const qty = Math.max(0, sanitizeNumber(it?.qty ?? it?.jumlah ?? row?.qty));
          const hargaJual = Math.max(
            0,
            sanitizeNumber(it?.hargaJual ?? it?.harga_jual ?? row?.harga_jual),
          );
          return {
            kode,
            nama,
            warna,
            qty,
            hargaJual,
            subtotal: qty * hargaJual,
          };
        })
        .filter(Boolean) as SaleItem[];

      const totalFromItems = items.reduce((sum, it) => sum + it.subtotal, 0);
      const total = Math.max(
        0,
        sanitizeNumber(row?.total ?? row?.grand_total ?? totalFromItems),
      );

      return {
        id,
        customer: sanitizeString(row?.customer || row?.nama_customer) || "Umum",
        timestamp: parseTimestamp(row?.timestamp || row?.tanggal || row?.created_at),
        items,
        total,
      };
    })
    .filter(Boolean) as SaleTransaction[];
}

function parseTimestamp(value: any) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
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
