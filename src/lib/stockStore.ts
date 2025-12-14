import { create } from "zustand";
import type { PurchaseTransaction, SaleTransaction, StockItem } from "./types";

type StockState = {
  items: StockItem[];
  sales: SaleTransaction[];
  purchases: PurchaseTransaction[];
  search: string;
  filter: "all" | "low" | "mid" | "ok";
  setSearch: (q: string) => void;
  setFilter: (f: StockState["filter"]) => void;
  updatePrice: (id: string, hargaBeli: number, hargaJual: number) => void;
  removeItem: (id: string) => void;
  applySale: (tx: SaleTransaction) => void;
  applyPurchase: (tx: PurchaseTransaction) => void;
};

const seed: StockItem[] = [
  {
    id: "1",
    kode: "SKU-001",
    nama: "Headset A",
    qty: 12,
    hargaBeli: 120000,
    hargaJual: 175000,
    warna: ["Hitam", "Putih"],
  },
  {
    id: "2",
    kode: "SKU-002",
    nama: "Charger C",
    qty: 4,
    hargaBeli: 45000,
    hargaJual: 75000,
    warna: ["Hitam"],
  },
  {
    id: "3",
    kode: "SKU-003",
    nama: "Cable Fast",
    qty: 8,
    hargaBeli: 25000,
    hargaJual: 40000,
    warna: ["Hitam", "Merah", "Biru"],
  },
];

export const useStockStore = create<StockState>((set, get) => ({
  items: seed,
  sales: [],
  purchases: [],
  search: "",
  filter: "all",
  setSearch: (q) => set({ search: q }),
  setFilter: (f) => set({ filter: f }),
  updatePrice: (id, hargaBeli, hargaJual) =>
    set((state) => ({
      items: state.items.map((it) =>
        it.id === id ? { ...it, hargaBeli, hargaJual } : it,
      ),
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((it) => it.id !== id),
    })),
  applySale: (tx) =>
    set((state) => {
      const updated = state.items.map((it) => {
        const found = tx.items.find((s) => s.kode === it.kode);
        if (!found) return it;
        const nextQty = Math.max(0, it.qty - found.qty);
        return { ...it, qty: nextQty };
      });
      return { items: updated, sales: [tx, ...state.sales].slice(0, 50) };
    }),
  applyPurchase: (tx) =>
    set((state) => {
      const updated = state.items.map((it) => {
        const found = tx.items.find((p) => p.kode === it.kode);
        if (!found) return it;
        return {
          ...it,
          qty: it.qty + found.qty,
          hargaBeli: found.hargaBeli,
        };
      });
      const newOnes = tx.items.filter(
        (p) => !state.items.some((it) => it.kode === p.kode),
      );
      const merged = updated.concat(
        newOnes.map((p, idx) => ({
          id: `new-${Date.now()}-${idx}`,
          kode: p.kode,
          nama: p.nama,
          qty: p.qty,
          hargaBeli: p.hargaBeli,
          hargaJual: Math.round(p.hargaBeli * 1.2),
          warna: [p.warna],
        })),
      );
      return { items: merged, purchases: [tx, ...state.purchases].slice(0, 50) };
    }),
}));

export function stockBadge(qty: number) {
  if (qty < 5) return "red";
  if (qty <= 10) return "yellow";
  return "green";
}

export function formatIDR(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}
