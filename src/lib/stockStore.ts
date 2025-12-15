import { create } from "zustand";
import type { PurchaseTransaction, SaleTransaction, StockItem } from "./types";

type StockState = {
  items: StockItem[];
  sales: SaleTransaction[];
  purchases: PurchaseTransaction[];
  search: string;
  filter: "all" | "zero" | "low" | "mid" | "ok";
  colorFilter: string;
  setItems: (items: StockItem[]) => void;
  setSearch: (q: string) => void;
  setFilter: (f: StockState["filter"]) => void;
  setColorFilter: (c: string) => void;
  updatePrice: (id: string, hargaBeli: number, hargaJual: number) => void;
  updateItem: (id: string, payload: Partial<StockItem>) => void;
  removeItem: (id: string) => void;
  addItem: (item: StockItem) => void;
  applySale: (tx: SaleTransaction) => void;
  applyPurchase: (tx: PurchaseTransaction) => void;
};

export const useStockStore = create<StockState>((set, get) => ({
  items: [],
  sales: [],
  purchases: [],
  search: "",
  filter: "all",
  colorFilter: "",
  setItems: (items) => set({ items }),
  setSearch: (q) => set({ search: q }),
  setFilter: (f) => set({ filter: f }),
  setColorFilter: (c) => set({ colorFilter: c }),
  updatePrice: (id, hargaBeli, hargaJual) =>
    set((state) => ({
      items: state.items.map((it) =>
        it.id === id ? { ...it, hargaBeli, hargaJual } : it,
      ),
    })),
  updateItem: (id, payload) =>
    set((state) => ({
      items: state.items.map((it) => (it.id === id ? { ...it, ...payload } : it)),
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((it) => it.id !== id),
    })),
  addItem: (item) =>
    set((state) => ({
      items: [{ ...item, id: `new-${Date.now()}` }, ...state.items],
    })),
  applySale: (tx) =>
    set((state) => {
      const updated = state.items.map((it) => {
        const found = tx.items.find((s) => s.kode === it.kode);
        if (!found) return it;
        const nextQty = Math.max(0, it.qty - found.qty);
        const nextVariant =
          it.variantStock?.map((v) =>
            v.name === found.warna
              ? { ...v, qty: Math.max(0, v.qty - found.qty) }
              : v,
          ) || it.variantStock;
        return { ...it, qty: nextQty, variantStock: nextVariant };
      });
      return { items: updated, sales: [tx, ...state.sales].slice(0, 50) };
    }),
  applyPurchase: (tx) =>
    set((state) => {
      const updated = state.items.map((it) => {
        const found = tx.items.find((p) => p.kode === it.kode);
        if (!found) return it;
        const nextVariant =
          it.variantStock?.map((v) =>
            v.name === found.warna
              ? { ...v, qty: v.qty + found.qty }
              : v,
          ) || it.variantStock;
        return {
          ...it,
          qty: it.qty + found.qty,
          hargaBeli: found.hargaBeli,
          variantStock: nextVariant,
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
          variantStock: [{ name: p.warna, qty: p.qty }],
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
