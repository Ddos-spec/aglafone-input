import type { PurchaseTransaction, SaleTransaction, StockItem } from "./types";

export function downloadCSV(filename: string, rows: Record<string, string | number>[]) {
  const header = Object.keys(rows[0] || {});
  const body = rows
    .map((r) =>
      header
        .map((h) => {
          const val = r[h] ?? "";
          const txt = String(val).replace(/"/g, '""');
          return `"${txt}"`;
        })
        .join(","),
    )
    .join("\n");
  const csv = [header.join(","), body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportStockCSV(items: StockItem[]) {
  const rows = items.map((it) => ({
    kode: it.kode,
    nama: it.nama,
    qty: it.qty,
    harga_beli: it.hargaBeli,
    harga_jual: it.hargaJual,
    warna: it.warna.join("|"),
  }));
  if (rows.length) downloadCSV("stok.csv", rows);
}

export function exportSalesCSV(sales: SaleTransaction[]) {
  const rows = sales.flatMap((s) =>
    s.items.map((it) => ({
      transaksi_id: s.id,
      waktu: s.timestamp,
      customer: s.customer,
      kode: it.kode,
      nama: it.nama,
      qty: it.qty,
      harga_jual: it.hargaJual,
      subtotal: it.subtotal,
    })),
  );
  if (rows.length) downloadCSV("penjualan.csv", rows);
}

export function exportPurchaseCSV(purchases: PurchaseTransaction[]) {
  const rows = purchases.flatMap((p) =>
    p.items.map((it) => ({
      transaksi_id: p.id,
      kode: it.kode,
      nama: it.nama,
      qty: it.qty,
      harga_beli: it.hargaBeli,
      supplier: it.supplier,
      tanggal: it.tanggal,
      total: it.qty * it.hargaBeli,
    })),
  );
  if (rows.length) downloadCSV("pembelian.csv", rows);
}
