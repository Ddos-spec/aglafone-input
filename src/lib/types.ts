export type StockItem = {
  id: string;
  kode: string;
  nama: string;
  qty: number;
  hargaBeli: number;
  hargaJual: number;
  warna: string[];
};

export type SaleItem = {
  kode: string;
  nama: string;
  warna: string;
  qty: number;
  hargaJual: number;
  subtotal: number;
};

export type PurchaseItem = {
  kode: string;
  nama: string;
  warna: string;
  qty: number;
  hargaBeli: number;
  supplier: string;
  tanggal: string;
  imageUrl?: string;
};

export type SaleTransaction = {
  id: string;
  customer: string;
  timestamp: string;
  items: SaleItem[];
  total: number;
};

export type PurchaseTransaction = {
  id: string;
  items: PurchaseItem[];
  total: number;
  imageUrl?: string;
};
