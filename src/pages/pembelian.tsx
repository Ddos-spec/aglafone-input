import imageCompression from "browser-image-compression";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { exportPurchaseCSV } from "../lib/export";
import { formatIDR, useStockStore } from "../lib/stockStore";
import type { PurchaseItem, PurchaseTransaction, StockItem } from "../lib/types";
import { useDropzone } from "react-dropzone";

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

export default function PembelianPage() {
  const { items: stock, applyPurchase, purchases } = useStockStore();
  const [preview, setPreview] = useState<string | undefined>();
  const form = useForm<PurchaseForm>({
    defaultValues: {
      kode: "",
      nama: "",
      qty: 1,
      hargaBeli: 0,
      supplier: "",
      warna: "",
      tanggal: new Date().toISOString().slice(0, 10),
    },
  });

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    form.setValue("file", {
      0: file,
      length: 1,
      item: (idx: number) => file,
    } as any);
  }, [form]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [".jpeg", ".jpg"], "image/png": [".png"] },
    maxSize: 2 * 1024 * 1024,
    multiple: false,
  });

  const totalBelanja = (form.watch("qty") || 0) * (form.watch("hargaBeli") || 0);

  async function compressFile(file: File) {
    const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1280 });
    return compressed;
  }

  async function submit(values: PurchaseForm) {
    let imageUrl = preview;
    const file = values.file?.[0];
    if (file) {
      const compressed = await compressFile(file);
      imageUrl = await imageCompression.getDataUrlFromFile(compressed);
    }

    const item: PurchaseItem = {
      kode: values.kode,
      nama: values.nama,
      qty: values.qty,
      hargaBeli: values.hargaBeli,
      supplier: values.supplier,
      warna: values.warna,
      tanggal: values.tanggal,
      imageUrl,
    };

    const tx: PurchaseTransaction = {
      id: `PUR-${Date.now()}`,
      items: [item],
      total: item.qty * item.hargaBeli,
      imageUrl,
    };

    applyPurchase(tx);
    alert("Pembelian tersimpan (mock upload).");
    form.reset();
    setPreview(undefined);
    form.setValue("tanggal", new Date().toISOString().slice(0, 10));
  }

  function fillFromStock(kode: string) {
    const found = stock.find((s) => s.kode === kode);
    if (found) {
      form.setValue("kode", found.kode);
      form.setValue("nama", found.nama);
      form.setValue("warna", found.warna[0] || "");
      form.setValue("hargaBeli", found.hargaBeli);
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="flex" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="title">Form Pembelian</div>
            <div className="muted">Update stok & unggah foto struk (mock)</div>
          </div>
          <button className="btn secondary" onClick={() => exportPurchaseCSV(purchases)}>
            Export CSV
          </button>
        </div>
        <div className="divider" />
        <form className="grid" style={{ gap: 12 }} onSubmit={form.handleSubmit(submit)}>
          <div className="grid grid-3">
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Kode Barang</span>
              <input
                className="input"
                placeholder="SKU-001"
                {...form.register("kode")}
                list="kode-list"
                onBlur={(e) => fillFromStock(e.target.value)}
              />
              <datalist id="kode-list">
                {stock.map((s) => (
                  <option key={s.kode} value={s.kode}>
                    {s.nama}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Nama Barang</span>
              <input className="input" {...form.register("nama")} />
            </label>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Supplier</span>
              <input className="input" {...form.register("supplier")} />
            </label>
          </div>

          <div className="grid grid-3">
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
              <span className="muted">Warna</span>
              <input className="input" {...form.register("warna")} placeholder="Hitam" />
            </label>
          </div>

          <div className="grid grid-3">
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
            <div className="upload" {...getRootProps()}>
              <input {...getInputProps()} />
              {isDragActive ? "Lepas file di sini..." : "Drop atau klik untuk upload"}
              {preview && <div style={{ marginTop: 10 }}>Preview siap.</div>}
            </div>
            {preview && (
              <div style={{ marginTop: 10 }}>
                <div
                  className="card-thumb"
                  style={{
                    backgroundImage: `url(${preview})`,
                  }}
                />
                <button className="btn secondary" type="button" style={{ marginTop: 8 }} onClick={() => setPreview(undefined)}>
                  Hapus Foto
                </button>
              </div>
            )}
          </div>

          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn" type="submit">
              Simpan Pembelian
            </button>
          </div>
        </form>
      </div>

      <History purchases={purchases} />
    </div>
  );
}

function History({ purchases }: { purchases: PurchaseTransaction[] }) {
  return (
    <div className="card">
      <div className="title">History Pembelian</div>
      <div className="gallery">
        {purchases.map((p) => {
          const item = p.items[0];
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
              <div className="muted small">Tanggal: {item.tanggal}</div>
              <div className="muted small">Warna: {item.warna}</div>
              <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => window.open(item.imageUrl || "#", "_blank")}>
                Lihat Struk
              </button>
            </div>
          );
        })}
        {!purchases.length && <div className="muted">Belum ada pembelian.</div>}
      </div>
    </div>
  );
}
