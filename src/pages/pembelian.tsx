import imageCompression from "browser-image-compression";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useDropzone } from "react-dropzone";
import { API_ENDPOINTS, apiCall, apiGet } from "../config/api";
import { exportPurchaseCSV } from "../lib/export";
import { formatIDR, useStockStore } from "../lib/stockStore";
import type { PurchaseItem, PurchaseTransaction, StockItem } from "../lib/types";
import { generatePembelianId } from "../utils/generateId";
import { isValidDateString, sanitizeNumber, sanitizeString } from "../utils/validation";

type PurchaseFormItem = {
  kode: string;
  nama: string;
  qty: number;
  hargaBeli: number;
  warna: string;
  subtotal: number;
};

type PurchaseForm = {
  supplier: string;
  tanggal: string;
  items: PurchaseFormItem[];
};

type Toast = { id: number; message: string; tone: "success" | "error" };

const defaultItem: PurchaseFormItem = {
  kode: "",
  nama: "",
  qty: 1,
  hargaBeli: 0,
  warna: "",
  subtotal: 0,
};

const defaultValues: PurchaseForm = {
  supplier: "",
  tanggal: new Date().toISOString().slice(0, 10),
  items: [{ ...defaultItem }],
};

export default function PembelianPage() {
  const { items: stock, applyPurchase } = useStockStore();
  const [preview, setPreview] = useState<string | undefined>();
  const [uploadStatus, setUploadStatus] = useState<"idle" | "compressing" | "done">("idle");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PurchaseTransaction[]>([]);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [queries, setQueries] = useState<string[]>([""]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [colorFocusIdx, setColorFocusIdx] = useState<number | null>(null);

  const form = useForm<PurchaseForm>({ defaultValues });

  // Get unique colors from stock for autocomplete
  const uniqueColors = useMemo(() => {
    const set = new Set<string>();
    stock.forEach((it) => {
      it.warna.forEach((w) => {
        if (w.trim()) set.add(w.trim().toLowerCase());
      });
    });
    return Array.from(set).sort();
  }, [stock]);
  const { fields, append, remove, update } = useFieldArray<PurchaseForm, "items">({
    control: form.control,
    name: "items",
  });

  useEffect(() => {
    setQueries(new Array(fields.length).fill(""));
  }, [fields.length]);

  // Fetch history on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    if (!API_ENDPOINTS.riwayatPembelian) {
      console.log("[Pembelian] Riwayat endpoint not configured");
      return;
    }
    setHistoryLoading(true);
    try {
      console.log("[Pembelian] Fetching riwayat from:", API_ENDPOINTS.riwayatPembelian);
      const response = await apiCall<any>(API_ENDPOINTS.riwayatPembelian, { action: "read" }, { timeoutMs: 20000 });
      const mapped = normalizePurchaseHistory(response);
      console.log("[Pembelian] Mapped history:", mapped);
      if (!mapped.length) {
        throw new Error("Data riwayat pembelian kosong dari webhook.");
      }
      setHistory(mapped);
    } catch (error: any) {
      console.error("[Pembelian] Fetch riwayat error:", error);
    } finally {
      setHistoryLoading(false);
    }
  }

  const watchedItems = form.watch("items") || [];
  const grandTotal = watchedItems.reduce((sum: number, it: PurchaseFormItem) => {
    return sum + sanitizeNumber(it.qty) * sanitizeNumber(it.hargaBeli);
  }, 0);

  function filteredStock(query: string) {
    return stock
      .filter(
        (s) =>
          s.kode.toLowerCase().includes(query.toLowerCase()) ||
          s.nama.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, 10);
  }

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setUploadStatus("compressing");
      setTimeout(async () => {
        const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1280 });
        const url = await imageCompression.getDataUrlFromFile(compressed);
        setPreview(url);
        setUploadStatus("done");
      }, 1000);
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [".jpeg", ".jpg"], "image/png": [".png"] },
    maxSize: 2 * 1024 * 1024,
    multiple: false,
  });

  function pushToast(message: string, tone: "success" | "error") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  function selectStock(rowIdx: number, item: StockItem | undefined) {
    if (!item) return;
    update(rowIdx, {
      ...fields[rowIdx],
      kode: item.kode,
      nama: item.nama,
      warna: item.warna.join(", "),
      hargaBeli: sanitizeNumber(item.hargaBeli),
      qty: 1,
      subtotal: sanitizeNumber(item.hargaBeli),
    });
  }

  function handleQtyChange(idx: number, qty: number) {
    const current = form.getValues(`items.${idx}`);
    const safeQty = Math.max(0, sanitizeNumber(qty));
    const harga = sanitizeNumber(current.hargaBeli);
    update(idx, {
      ...current,
      qty: safeQty,
      subtotal: safeQty * harga,
    });
  }

  function handleHargaChange(idx: number, hargaBeli: number) {
    const current = form.getValues(`items.${idx}`);
    const harga = sanitizeNumber(hargaBeli);
    const qty = sanitizeNumber(current.qty);
    update(idx, {
      ...current,
      hargaBeli: harga,
      subtotal: qty * harga,
    });
  }

  async function submit(values: PurchaseForm) {
    if (saving) return;
    if (!API_ENDPOINTS.pembelian) {
      pushToast("Konfigurasi webhook pembelian belum diset.", "error");
      return;
    }

    const supplier = sanitizeString(values.supplier);
    const tanggal = sanitizeString(values.tanggal);

    const errors: string[] = [];
    if (!supplier) errors.push("Supplier wajib diisi.");
    if (!values.items.length) errors.push("Tambahkan minimal 1 item.");
    if (!isValidDateString(tanggal)) errors.push("Tanggal tidak valid.");

    const itemsPayload = values.items.map((it) => {
      const kode = sanitizeString(it.kode);
      const nama = sanitizeString(it.nama);
      const warna = sanitizeString(it.warna);
      const qty = sanitizeNumber(it.qty);
      const hargaBeli = sanitizeNumber(it.hargaBeli);

      if (!kode || !nama) {
        errors.push("Kode dan nama barang wajib diisi.");
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push("Qty harus lebih dari 0.");
      }
      if (!Number.isFinite(hargaBeli) || hargaBeli < 0) {
        errors.push("Harga beli harus berupa angka.");
      }

      return {
        kode_barang: kode,
        nama_barang: nama,
        qty,
        harga_beli: hargaBeli,
        warna: warna || "-",
        total: qty * hargaBeli,
      };
    });

    const total = itemsPayload.reduce((sum, it) => sum + it.total, 0);
    if (total <= 0) errors.push("Total tidak boleh 0.");

    if (errors.length) {
      pushToast(Array.from(new Set(errors)).join(" "), "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: generatePembelianId(),
        supplier,
        tanggal,
        items: itemsPayload,
        total,
        foto_url: preview || "",
        created_at: new Date().toISOString(),
      };
      const response = await apiCall(API_ENDPOINTS.pembelian, payload, { timeoutMs: 30000 });
      if (response && typeof response === "object" && "success" in response && (response as any).success === false) {
        throw new Error((response as any).message || "Gagal menyimpan pembelian!");
      }

      const txItems: PurchaseItem[] = itemsPayload.map((it) => ({
        kode: it.kode_barang,
        nama: it.nama_barang,
        qty: it.qty,
        hargaBeli: it.harga_beli,
        warna: it.warna,
        supplier,
        tanggal,
        imageUrl: preview,
      }));

      const tx: PurchaseTransaction = {
        id: payload.id,
        items: txItems,
        total,
        imageUrl: preview,
      };

      applyPurchase(tx);
      setHistory((prev) => [tx, ...prev]);
      pushToast((response as any)?.message || "Pembelian berhasil disimpan!", "success");
      form.reset({
        ...defaultValues,
        tanggal: new Date().toISOString().slice(0, 10),
      });
      setPreview(undefined);
      setUploadStatus("idle");
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Submit Pembelian Error:", error);
      }
      pushToast(error?.message || "Gagal menyimpan pembelian!", "error");
    } finally {
      setSaving(false);
    }
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
            <div className="title">Form Pembelian</div>
            <div className="muted small">Multi-item, update stok otomatis</div>
          </div>
          <button
            className="btn secondary"
            onClick={() => {
              alert("Export akan tersedia setelah integrasi backend");
              exportPurchaseCSV([]);
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
              <span className="muted small">Supplier</span>
              <input
                className="input"
                placeholder="Nama supplier"
                {...form.register("supplier")}
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
            {fields.map((field, idx) => {
              const kode = form.watch(`items.${idx}.kode`);
              const existingItem = stock.find((s) => s.kode === kode);

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

                  <div className="grid" style={{ gap: 12, gridTemplateColumns: "repeat(5, 1fr)" }}>
                    {/* Kode Barang */}
                    <div>
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
                          placeholder="Cari atau ketik baru..."
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
                                <div className="muted small">{item.nama}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {existingItem && (
                        <small className="small green" style={{ display: "block", marginTop: 2 }}>
                          Barang ada di stok
                        </small>
                      )}
                    </div>

                    {/* Nama Barang */}
                    <div style={{ gridColumn: "span 2" }}>
                      <div className="muted small" style={{ marginBottom: 4 }}>Nama Barang</div>
                      <input
                        className="input"
                        placeholder="Nama produk"
                        style={{ width: "100%" }}
                        {...form.register(`items.${idx}.nama`)}
                      />
                    </div>

                    {/* Qty */}
                    <div>
                      <div className="muted small" style={{ marginBottom: 4 }}>Qty</div>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={form.watch(`items.${idx}.qty`)}
                        onChange={(e) => handleQtyChange(idx, Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>

                    {/* Harga Beli */}
                    <div>
                      <div className="muted small" style={{ marginBottom: 4 }}>Harga Beli</div>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={form.watch(`items.${idx}.hargaBeli`)}
                        onChange={(e) => handleHargaChange(idx, Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  {/* Warna with autocomplete */}
                  <div style={{ marginTop: 12, position: "relative" }}>
                    <div className="muted small" style={{ marginBottom: 4 }}>Warna (pisah dengan koma)</div>
                    <input
                      className="input"
                      placeholder="Contoh: black, silver, gold"
                      style={{ width: "100%" }}
                      value={form.watch(`items.${idx}.warna`)}
                      onFocus={() => setColorFocusIdx(idx)}
                      onBlur={() => setTimeout(() => setColorFocusIdx(null), 150)}
                      onChange={(e) => form.setValue(`items.${idx}.warna`, e.target.value)}
                    />
                    {/* Color suggestions */}
                    {colorFocusIdx === idx && uniqueColors.length > 0 && (
                      <div className="card" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, maxHeight: 150, overflowY: "auto", marginTop: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: 0 }}>
                        <div className="muted small" style={{ padding: "6px 12px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                          Warna tersedia (klik untuk tambah):
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8 }}>
                          {uniqueColors.slice(0, 15).map((color) => (
                            <span
                              key={color}
                              className="tag"
                              style={{ cursor: "pointer" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const current = form.getValues(`items.${idx}.warna`) || "";
                                const colors = current.split(",").map((c: string) => c.trim()).filter(Boolean);
                                if (!colors.includes(color)) {
                                  const newValue = colors.length > 0 ? `${current}, ${color}` : color;
                                  form.setValue(`items.${idx}.warna`, newValue);
                                }
                              }}
                            >
                              {color}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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
              append({ ...defaultItem });
              setQueries((q) => [...q, ""]);
            }}
          >
            + Tambah Item
          </button>

          {/* Upload Foto */}
          <div>
            <div className="muted small" style={{ marginBottom: 8 }}>
              Upload Foto Struk (opsional, JPG/PNG, max 2MB)
            </div>
            <div
              className={`upload ${isDragActive ? "upload-hover" : ""}`}
              style={{ minHeight: 120, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
              {...getRootProps()}
            >
              <input {...getInputProps()} />
              <div style={{ fontSize: "1.5rem" }}>📷</div>
              <div className="muted small">Drag & drop atau klik untuk upload</div>
              {uploadStatus === "compressing" && <div className="muted small">Mengkompresi...</div>}
            </div>
            {preview && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    backgroundImage: `url(${preview})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <button
                  className="btn danger"
                  type="button"
                  style={{ padding: "6px 12px" }}
                  onClick={() => {
                    setPreview(undefined);
                    setUploadStatus("idle");
                  }}
                >
                  Hapus Foto
                </button>
              </div>
            )}
          </div>

          <div className="flex" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button
              className="btn"
              type="submit"
              disabled={saving}
              style={{ padding: "12px 24px" }}
            >
              {saving ? "Menyimpan..." : "Simpan Pembelian"}
            </button>
          </div>
        </form>
      </div>

      <History
        purchases={history}
        onRefresh={refreshHistory}
        refreshing={historyRefreshing}
        loading={historyLoading}
        onDelete={(id) => setHistory((prev) => prev.filter((p) => p.id !== id))}
      />
    </div>
  );
}

function History({
  purchases,
  onRefresh,
  refreshing,
  loading,
  onDelete,
}: {
  purchases: PurchaseTransaction[];
  onRefresh: () => void;
  refreshing: boolean;
  loading: boolean;
  onDelete: (id: string) => void;
}) {
  const isLoading = loading || refreshing;
  return (
    <div className="card">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="title">History Pembelian</div>
        <button className="btn secondary" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>No</th>
            <th>Items</th>
            <th>Supplier</th>
            <th>Qty</th>
            <th>Total</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <tr key={idx}>
                <td colSpan={6}><div className="skeleton" style={{ height: 20 }} /></td>
              </tr>
            ))
          ) : purchases.length > 0 ? (
            purchases.slice(0, 10).map((p, idx) => (
              <tr key={p.id}>
                <td>{idx + 1}</td>
                <td>
                  {p.items.map((it) => it.nama).join(", ").slice(0, 40)}
                  {p.items.map((it) => it.nama).join(", ").length > 40 && "..."}
                </td>
                <td>{p.items[0]?.supplier || "-"}</td>
                <td>{p.items.length} item / {countPurchaseQty(p.items)} unit</td>
                <td>{formatIDR(p.total)}</td>
                <td>
                  <button className="btn danger" onClick={() => onDelete(p.id)}>Hapus</button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: 16 }}>
                Belum ada pembelian.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function normalizePurchaseHistory(payload: any): PurchaseTransaction[] {
  const raw = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return raw
    .map((row: any, idx: number) => {
      const id = sanitizeString(row?.id || row?.kode_transaksi || row?.kode || `px-${idx}`);
      if (!id) return null;
      const itemsSource = Array.isArray(row?.items) && row.items.length ? row.items : [row];
      const items: PurchaseItem[] = itemsSource
        .map((it: any) => {
          const kode = sanitizeString(it?.kode || it?.kode_barang || row?.kode_barang);
          const nama = sanitizeString(it?.nama || it?.nama_barang || row?.nama_barang);
          if (!kode || !nama) return null;
          const qty = Math.max(0, sanitizeNumber(it?.qty ?? it?.jumlah ?? row?.qty));
          const hargaBeli = Math.max(
            0,
            sanitizeNumber(it?.hargaBeli ?? it?.harga_beli ?? row?.harga_beli),
          );
          const warna = sanitizeString(it?.warna || row?.warna || "");
          const supplier = sanitizeString(it?.supplier || row?.supplier);
          const tanggal = parseTimestamp(it?.tanggal || row?.tanggal || row?.created_at);
          const imageUrl = sanitizeString(it?.foto_url || it?.imageUrl || row?.foto_url);
          return {
            kode,
            nama,
            qty,
            hargaBeli,
            supplier,
            warna,
            tanggal,
            imageUrl,
          };
        })
        .filter(Boolean) as PurchaseItem[];

      const totalFromItems = items.reduce((sum, it) => sum + it.qty * it.hargaBeli, 0);
      const total = Math.max(
        0,
        sanitizeNumber(row?.total ?? row?.grand_total ?? totalFromItems),
      );

      return {
        id,
        items,
        total,
        imageUrl: items[0]?.imageUrl,
      };
    })
    .filter(Boolean) as PurchaseTransaction[];
}

function parseTimestamp(value: any) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
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

function countPurchaseQty(items: PurchaseItem[]) {
  return items.reduce((sum, it) => sum + sanitizeNumber(it.qty), 0);
}
