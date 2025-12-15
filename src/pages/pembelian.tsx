import imageCompression from "browser-image-compression";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useDropzone } from "react-dropzone";
import { API_ENDPOINTS, apiCall } from "../config/api";
import { exportPurchaseCSV } from "../lib/export";
import { formatIDR, useStockStore } from "../lib/stockStore";
import type { PurchaseItem, PurchaseTransaction, StockItem } from "../lib/types";

type PurchaseForm = {
  kode: string;
  nama: string;
  qty: number;
  hargaBeli: number;
  supplier: string;
  warna: string;
  tanggal: string;
  imageUrl?: string;
  file?: FileList;
};

type Toast = { id: number; message: string; tone: "success" | "error" };

const defaultValues: PurchaseForm = {
  kode: "",
  nama: "",
  qty: 1,
  hargaBeli: 0,
  supplier: "",
  warna: "",
  tanggal: new Date().toISOString().slice(0, 10),
};

export default function PembelianPage() {
  const { items: stock, applyPurchase } = useStockStore();
  const [preview, setPreview] = useState<string | undefined>();
  const [uploadStatus, setUploadStatus] = useState<"idle" | "compressing" | "done">("idle");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PurchaseTransaction[]>([]);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const form = useForm<PurchaseForm>({ defaultValues });

  const filteredStock = useMemo(
    () =>
      stock
        .filter(
          (s) =>
            s.kode.toLowerCase().includes(query.toLowerCase()) ||
            s.nama.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 10),
    [query, stock],
  );

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
        form.setValue("file", {
          0: file,
          length: 1,
          item: () => file,
        } as any);
      }, 1000);
    },
    [form],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [".jpeg", ".jpg"], "image/png": [".png"] },
    maxSize: 2 * 1024 * 1024,
    multiple: false,
  });

  const totalBelanja = (form.watch("qty") || 0) * (form.watch("hargaBeli") || 0);

  function pushToast(message: string, tone: "success" | "error") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  function fillFromStock(kode: string) {
    const found: StockItem | undefined = stock.find((s) => s.kode === kode);
    if (found) {
      form.setValue("kode", found.kode);
      form.setValue("nama", found.nama);
      form.setValue("warna", found.warna.join(", "));
      form.setValue("hargaBeli", found.hargaBeli);
    }
  }

  async function submit(values: PurchaseForm) {
    if (!values.supplier) {
      alert("Supplier wajib diisi");
      return;
    }
    if (!values.kode || !values.nama) {
      alert("Kode dan nama barang wajib diisi");
      return;
    }
    if (totalBelanja <= 0) {
      alert("Total tidak boleh 0");
      return;
    }
    setSaving(true);
    try {
      const item: PurchaseItem = {
        kode: values.kode,
        nama: values.nama,
        qty: values.qty,
        hargaBeli: values.hargaBeli,
        supplier: values.supplier,
        warna: values.warna,
        tanggal: values.tanggal,
        imageUrl: preview,
      };
      const payload = {
        kode_barang: values.kode,
        nama_barang: values.nama,
        qty: values.qty,
        harga_beli: values.hargaBeli,
        supplier: values.supplier,
        warna: values.warna,
        tanggal: values.tanggal,
        foto_url: preview || "",
        total: item.qty * item.hargaBeli,
        created_at: new Date().toISOString(),
      };
      await apiCall(API_ENDPOINTS.pembelian, payload);
      const tx: PurchaseTransaction = {
        id: `PUR-${Date.now()}`,
        items: [item],
        total: item.qty * item.hargaBeli,
        imageUrl: preview,
      };
      applyPurchase(tx);
      setHistory((prev) => [tx, ...prev]);
      pushToast("Pembelian berhasil disimpan!", "success");
      form.reset({
        ...defaultValues,
        tanggal: new Date().toISOString().slice(0, 10),
      });
      setPreview(undefined);
      setUploadStatus("idle");
    } catch (error) {
      pushToast("Gagal menyimpan pembelian!", "error");
    } finally {
      setSaving(false);
    }
  }

  function refreshHistory() {
    setHistoryRefreshing(true);
    setTimeout(() => setHistoryRefreshing(false), 1000);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <ToastContainer toasts={toasts} />
      <div className="card" style={{ padding: "2rem" }}>
        <div className="flex" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="title">Form Pembelian</div>
            <div className="muted">Update stok & unggah foto struk</div>
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
        <form className="grid" style={{ gap: "1.5rem" }} onSubmit={form.handleSubmit(submit)}>
          <div className="grid grid-3" style={{ gap: "1rem" }}>
            <div>
              <div className="muted">Kode Barang</div>
              <input
                className="input"
                placeholder="Ketik kode atau nama..."
                value={form.watch("kode")}
                onChange={(e) => {
                  setQuery(e.target.value);
                  form.setValue("kode", e.target.value);
                }}
                list="kode-list"
                onBlur={(e) => fillFromStock(e.target.value)}
              />
              <datalist id="kode-list">
                {filteredStock.map((s) => (
                  <option key={s.kode} value={s.kode}>
                    {s.nama}
                  </option>
                ))}
                <option value="__new">Tambah Barang Baru</option>
              </datalist>
            </div>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Nama Barang</span>
              <input className="input" {...form.register("nama")} />
            </label>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Supplier</span>
              <input className="input" {...form.register("supplier")} />
            </label>
          </div>

          <div className="grid grid-3" style={{ gap: "1rem" }}>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Qty</span>
              <input className="input" type="number" min={0} {...form.register("qty", { valueAsNumber: true })} />
            </label>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Harga Beli</span>
              <input
                className="input"
                type="number"
                min={0}
                {...form.register("hargaBeli", { valueAsNumber: true })}
              />
            </label>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Warna (multi)</span>
              <input
                className="input"
                placeholder="Contoh: black, silver, gold"
                {...form.register("warna")}
              />
            </label>
          </div>

          <div className="grid grid-3" style={{ gap: "1rem" }}>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Tanggal Pembelian</span>
              <input className="input" type="date" {...form.register("tanggal")} />
            </label>
            <div className="grid" style={{ gap: 4 }}>
              <span className="muted">Total</span>
              <div className="title">{formatIDR(totalBelanja)}</div>
            </div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              Upload Foto Struk (JPG/PNG, max 2MB)
            </div>
            <div
              className={`upload ${isDragActive ? "upload-hover" : ""}`}
              style={{ minHeight: 200, position: "relative" }}
              {...getRootProps()}
            >
              <input {...getInputProps()} />
              <div style={{ fontSize: "2rem" }}>⬆</div>
              <div>Drag & drop atau klik untuk upload</div>
              {uploadStatus === "compressing" && <div className="muted">Compressing...</div>}
              {uploadStatus === "done" && <div className="muted">Foto berhasil diupload (compressed)</div>}
            </div>
            {preview && (
              <div style={{ marginTop: 10, position: "relative", width: 150 }}>
                <div
                  className="card-thumb"
                  style={{
                    width: 150,
                    height: 150,
                    backgroundImage: `url(${preview})`,
                  }}
                />
                <button
                  className="btn danger"
                  type="button"
                  style={{ position: "absolute", top: 6, right: 6, padding: "6px 8px" }}
                  onClick={() => {
                    setPreview(undefined);
                    setUploadStatus("idle");
                  }}
                >
                  Hapus
                </button>
                <div className="muted small" style={{ marginTop: 6 }}>
                  {form.watch("file")?.[0]?.name || "preview.jpg"}
                </div>
              </div>
            )}
          </div>

          <div className="flex" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Pembelian"}
            </button>
          </div>
        </form>
      </div>

      <History
        purchases={history}
        onRefresh={refreshHistory}
        refreshing={historyRefreshing}
        onDelete={(id) => setHistory((prev) => prev.filter((p) => p.id !== id))}
      />
    </div>
  );
}

function History({
  purchases,
  onRefresh,
  refreshing,
  onDelete,
}: {
  purchases: PurchaseTransaction[];
  onRefresh: () => void;
  refreshing: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="card">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="title">History Pembelian</div>
        <button className="btn secondary" onClick={onRefresh}>
          {refreshing ? "⟳ Refreshing..." : "⟳ Refresh"}
        </button>
      </div>
      <div className="gallery">
        {purchases.map((p) => {
          const item = p.items[0];
          const hasImage = Boolean(item.imageUrl);
          return (
            <div key={p.id} className="card">
              <div
                className="card-thumb"
                style={{
                  backgroundImage: `url(${item.imageUrl || "https://via.placeholder.com/300x200?text=Struk"})`,
                }}
              />
              <div className="title" style={{ fontSize: "1rem", marginTop: 8 }}>
                {item.kode} — {item.nama}
              </div>
              <div className="muted small">
                Qty {item.qty} · {formatIDR(item.hargaBeli)} · Supplier: {item.supplier}
              </div>
              <div className="muted small">Tanggal: {formatFriendlyDate(item.tanggal)}</div>
              <div className="muted small">Warna: {item.warna}</div>
              <div className="table-actions" style={{ marginTop: 8 }}>
                <button className="btn secondary" onClick={() => alert("Detail pembelian belum tersedia.")}>
                  👁 Lihat
                </button>
                <button className="btn" onClick={() => alert("Fitur cetak akan tersedia kemudian.")}>
                  🖨 Print
                </button>
                <button className="btn danger" onClick={() => onDelete(p.id)}>
                  🗑 Hapus
                </button>
              </div>
            </div>
          );
        })}
        {!purchases.length && <div className="muted">Belum ada pembelian.</div>}
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

function formatFriendlyDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
