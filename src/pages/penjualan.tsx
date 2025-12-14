import { Combobox } from "@headlessui/react";
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
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

export default function PenjualanPage() {
  const { items: stock, applySale, sales } = useStockStore();
  const form = useForm<SaleForm>({
    defaultValues: {
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
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = form.watch("items") || [];
  const grandTotal = watchedItems.reduce((sum, it) => sum + (it.subtotal || 0), 0);

  function selectStock(rowIdx: number, item: StockItem | undefined) {
    if (!item) return;
    update(rowIdx, {
      ...fields[rowIdx],
      kode: item.kode,
      nama: item.nama,
      warna: item.warna[0] ?? "",
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
    const txId = `SALES-${Date.now()}`;
    const txItems: SaleItem[] = values.items.map((it) => ({
      ...it,
      subtotal: it.qty * it.hargaJual,
    }));
    const total = txItems.reduce((sum, it) => sum + it.subtotal, 0);
    const tx: SaleTransaction = {
      id: txId,
      customer: values.customer || "Umum",
      timestamp: new Date(values.tanggal).toISOString(),
      items: txItems,
      total,
    };
    const invalid = txItems.find((it) => {
      const stok = stock.find((s) => s.kode === it.kode);
      return !stok || it.qty > stok.qty;
    });
    if (invalid) {
      alert("Qty tidak boleh melebihi stok tersedia.");
      return;
    }
    applySale(tx);
    generatePDF(tx);
    alert("Penjualan tersimpan & struk diunduh.");
    form.reset();
    form.setValue("tanggal", new Date().toISOString().slice(0, 10));
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="flex" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="title">Form Penjualan</div>
            <div className="muted">Multi-item, auto subtotal, PDF struk</div>
          </div>
          <button className="btn secondary" onClick={() => exportSalesCSV(sales)}>
            Export CSV
          </button>
        </div>
        <div className="divider" />
        <form className="grid" style={{ gap: 12 }} onSubmit={form.handleSubmit(submit)}>
          <div className="grid grid-3">
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Customer</span>
              <input className="input" placeholder="Nama customer" {...form.register("customer")} />
            </label>
            <label className="grid" style={{ gap: 4 }}>
              <span className="muted">Tanggal</span>
              <input className="input" type="date" {...form.register("tanggal")} />
            </label>
            <div className="grid" style={{ gap: 4 }}>
              <span className="muted">Grand Total</span>
              <div className="title">{formatIDR(grandTotal)}</div>
            </div>
          </div>

          <div className="grid" style={{ gap: 8 }}>
            {fields.map((field, idx) => (
              <div key={field.id} className="card" style={{ padding: 12 }}>
                <div className="flex" style={{ justifyContent: "space-between" }}>
                  <div className="muted">Item #{idx + 1}</div>
                  {fields.length > 1 && (
                    <button className="btn danger" type="button" onClick={() => remove(idx)}>
                      Hapus
                    </button>
                  )}
                </div>
                <div className="grid" style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                  <div>
                    <div className="muted">Kode Barang</div>
                    <Combobox
                      value={form.watch(`items.${idx}.kode`)}
                      onChange={(val) => {
                        const found = stock.find((s) => s.kode === val);
                        selectStock(idx, found);
                      }}
                    >
                      <Combobox.Input
                        className="input"
                        onChange={(e) => form.setValue(`items.${idx}.kode`, e.target.value)}
                        placeholder="Pilih kode..."
                      />
                      <Combobox.Options className="card" style={{ marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
                        {stock.map((item) => (
                          <Combobox.Option key={item.kode} value={item.kode} className="muted" style={{ padding: 8, cursor: "pointer" }}>
                            {item.kode} — {item.nama}
                          </Combobox.Option>
                        ))}
                      </Combobox.Options>
                    </Combobox>
                  </div>
                  <label className="grid" style={{ gap: 4 }}>
                    <span className="muted">Nama Barang</span>
                    <input className="input" readOnly {...form.register(`items.${idx}.nama`)} />
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
                    <small className="muted small">
                      Stok: {stock.find((s) => s.kode === form.watch(`items.${idx}.kode`))?.qty ?? "-"}
                    </small>
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
                      {(stock.find((s) => s.kode === form.watch(`items.${idx}.kode`))?.warna || []).map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid" style={{ gap: 4 }}>
                    <span className="muted">Subtotal</span>
                    <div className="title">{formatIDR(form.watch(`items.${idx}.subtotal`) || 0)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn secondary"
            type="button"
            onClick={() =>
              append({
                kode: "",
                nama: "",
                warna: "",
                qty: 1,
                hargaJual: 0,
                subtotal: 0,
              })
            }
          >
            + Tambah Item
          </button>

          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn" type="submit">
              Submit & Cetak Struk
            </button>
          </div>
        </form>
      </div>

      <History sales={sales} />
    </div>
  );
}

function History({ sales }: { sales: SaleTransaction[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const list = sales.filter((s) => s.timestamp.startsWith(today));
  return (
    <div className="card">
      <div className="title">History Penjualan Hari Ini</div>
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
          {list.map((s, idx) => (
            <tr key={s.id}>
              <td>{idx + 1}</td>
              <td>{new Date(s.timestamp).toLocaleTimeString("id-ID")}</td>
              <td>{s.customer}</td>
              <td>{formatIDR(s.total)}</td>
              <td>
                <button className="btn secondary" onClick={() => generatePDF(s)}>
                  Reprint PDF
                </button>
              </td>
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: 12 }}>
                Belum ada transaksi hari ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
