import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { exportStockCSV } from "../lib/export";
import { formatIDR, stockBadge, useStockStore } from "../lib/stockStore";
import type { StockItem } from "../lib/types";

type EditForm = {
  hargaBeli: number;
  hargaJual: number;
};

export default function DashboardPage() {
  const { items, search, filter, setSearch, setFilter, updatePrice, removeItem } =
    useStockStore();
  const [editing, setEditing] = useState<StockItem | null>(null);
  const form = useForm<EditForm>({
    defaultValues: { hargaBeli: 0, hargaJual: 0 },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter(
        (it) =>
          it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q),
      )
      .filter((it) => {
        if (filter === "low") return it.qty < 5;
        if (filter === "mid") return it.qty >= 5 && it.qty <= 10;
        if (filter === "ok") return it.qty > 10;
        return true;
      });
  }, [filter, items, search]);

  const totalItems = items.length;
  const totalValue = items.reduce((sum, it) => sum + it.qty * it.hargaBeli, 0);
  const lowCount = items.filter((it) => it.qty < 5).length;

  function openEdit(item: StockItem) {
    setEditing(item);
    form.reset({ hargaBeli: item.hargaBeli, hargaJual: item.hargaJual });
  }

  function onSubmit(values: EditForm) {
    if (!editing) return;
    updatePrice(editing.id, values.hargaBeli, values.hargaJual);
    setEditing(null);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid grid-3">
        <SummaryCard title="Total Items" value={totalItems} />
        <SummaryCard title="Total Stock Value" value={formatIDR(totalValue)} />
        <SummaryCard title="Low Stock Alert" value={lowCount} tone="alert" />
      </div>

      <div className="card">
        <div className="flex" style={{ justifyContent: "space-between" }}>
          <div className="flex" style={{ flex: 1, minWidth: 260 }}>
            <input
              className="input"
              placeholder="Cari kode / nama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
            >
              <option value="all">Semua stok</option>
              <option value="low">Stok rendah (&lt;5)</option>
              <option value="mid">Stok 5-10</option>
              <option value="ok">Stok &gt;10</option>
            </select>
          </div>
          <button className="btn" onClick={() => exportStockCSV(items)}>
            Export CSV
          </button>
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama</th>
                <th>Stok</th>
                <th>Harga Beli</th>
                <th>Harga Jual</th>
                <th>Warna</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id}>
                  <td>{it.kode}</td>
                  <td>{it.nama}</td>
                  <td>
                    <span className={`badge ${stockBadge(it.qty)}`}>
                      ● {it.qty}
                    </span>
                  </td>
                  <td>{formatIDR(it.hargaBeli)}</td>
                  <td>{formatIDR(it.hargaJual)}</td>
                  <td>
                    <div className="pill-group">
                      {it.warna.map((w) => (
                        <span key={w} className="tag">
                          {w}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn secondary" onClick={() => openEdit(it)}>
                        Edit
                      </button>
                      <button className="btn danger" onClick={() => removeItem(it.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 16 }}>
                    Tidak ada data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Edit Harga</h3>
            <form className="grid" style={{ gap: 12 }} onSubmit={form.handleSubmit(onSubmit)}>
              <label className="grid" style={{ gap: 4 }}>
                <span className="muted">Harga Beli</span>
                <input
                  className="input"
                  type="number"
                  step="100"
                  {...form.register("hargaBeli", { valueAsNumber: true })}
                />
              </label>
              <label className="grid" style={{ gap: 4 }}>
                <span className="muted">Harga Jual</span>
                <input
                  className="input"
                  type="number"
                  step="100"
                  {...form.register("hargaJual", { valueAsNumber: true })}
                />
              </label>
              <div className="flex" style={{ justifyContent: "flex-end" }}>
                <button className="btn secondary" type="button" onClick={() => setEditing(null)}>
                  Batal
                </button>
                <button className="btn" type="submit">
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number | string;
  tone?: "alert";
}) {
  return (
    <div className="card">
      <div className="muted">{title}</div>
      <div
        style={{
          fontSize: "1.6rem",
          fontWeight: 800,
          color: tone === "alert" ? "#b91c1c" : "#0f172a",
        }}
      >
        {value}
      </div>
    </div>
  );
}
