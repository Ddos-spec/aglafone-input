import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { API_ENDPOINTS, apiCall } from "../config/api";
import { exportStockCSV } from "../lib/export";
import { formatIDR, stockBadge, useStockStore } from "../lib/stockStore";
import type { StockItem } from "../lib/types";

type Toast = { id: number; message: string; tone: "success" | "error" };

type ApiStockItem = {
  kode_barang: string;
  nama_barang: string;
  stok_awal: number;
  stok_masuk: number;
  stok_keluar: number;
  stok_akhir: number;
  harga_beli: number;
  harga_jual: number;
  warna: string;
  row_number?: number;
};

type SortKey = "kode" | "nama" | "qty" | "hargaBeli" | "hargaJual";

type AddForm = {
  kode: string;
  nama: string;
  qty: number;
  hargaBeli: number;
  hargaJual: number;
  warna: string;
};

export default function DashboardPage() {
  const {
    items,
    search,
    filter,
    colorFilter,
    setItems,
    setSearch,
    setFilter,
    setColorFilter,
    updateItem,
    updatePrice,
    removeItem,
    addItem,
  } = useStockStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "kode",
    dir: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StockItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const editForm = useForm<AddForm>({
    defaultValues: {
      kode: "",
      nama: "",
      qty: 0,
      hargaBeli: 0,
      hargaJual: 0,
      warna: "",
    },
  });
  const addForm = useForm<AddForm>({
    defaultValues: {
      kode: "",
      nama: "",
      qty: 0,
      hargaBeli: 0,
      hargaJual: 0,
      warna: "",
    },
  });

  function pushToast(message: string, tone: "success" | "error") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  async function fetchStokData(isRefresh = false) {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setFetchError(null);

      console.log("[Dashboard Stok] Fetching data from:", API_ENDPOINTS.stok);
      console.log("[Dashboard Stok] Payload:", { action: "read" });

      const response = await apiCall<ApiStockItem[]>(API_ENDPOINTS.stok, { action: "read" });

      console.log("[Dashboard Stok] Response:", response);

      // Map API response to StockItem format
      const mappedItems: StockItem[] = (response || []).map((item, idx) => ({
        id: `stok-${item.kode_barang}-${idx}`,
        kode: item.kode_barang,
        nama: item.nama_barang,
        qty: item.stok_akhir,
        hargaBeli: item.harga_beli,
        hargaJual: item.harga_jual,
        warna: item.warna ? item.warna.split(",").map((w) => w.trim()).filter(Boolean) : [],
        variantStock: item.warna
          ? item.warna.split(",").map((w) => w.trim()).filter(Boolean).map((w) => ({ name: w, qty: item.stok_akhir }))
          : [],
      }));

      setItems(mappedItems);
      console.log("[Dashboard Stok] Mapped items:", mappedItems.length);

      if (isRefresh) {
        pushToast("Data stok berhasil diperbarui", "success");
      }
    } catch (error: any) {
      console.error("[Dashboard Stok] Fetch error:", error);
      const errorMsg = error?.message || "Gagal memuat data stok";
      setFetchError(errorMsg);
      pushToast(errorMsg, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchStokData();
  }, []);

  const uniqueColors = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) =>
      it.variantStock?.forEach((v) => set.add(v.name)) ?? it.warna.forEach((w) => set.add(w)),
    );
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = items
      .filter((it) => it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q))
      .filter((it) => {
        if (filter === "zero") return it.qty === 0;
        if (filter === "low") return it.qty > 0 && it.qty < 5;
        if (filter === "mid") return it.qty >= 5 && it.qty <= 10;
        if (filter === "ok") return it.qty > 10;
        return true;
      })
      .filter((it) => {
        if (!colorFilter) return true;
        return (
          it.variantStock?.some((v) => v.name === colorFilter) ||
          it.warna.includes(colorFilter)
        );
      });

    list = list.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.key === "kode") return a.kode.localeCompare(b.kode) * dir;
      if (sort.key === "nama") return a.nama.localeCompare(b.nama) * dir;
      if (sort.key === "qty") return (a.qty - b.qty) * dir;
      if (sort.key === "hargaBeli") return (a.hargaBeli - b.hargaBeli) * dir;
      if (sort.key === "hargaJual") return (a.hargaJual - b.hargaJual) * dir;
      return 0;
    });
    return list;
  }, [colorFilter, filter, items, search, sort.dir, sort.key]);

  const totalValue = items.reduce((sum, it) => sum + it.qty * it.hargaBeli, 0);
  const lowCount = items.filter((it) => it.qty < 10).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const paged = filtered.slice(start, end);

  useEffect(() => {
    setPage(1);
  }, [pageSize, filter, search, colorFilter]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    const ids = paged.map((it) => it.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function deleteSelected() {
    selected.forEach((id) => removeItem(id));
    setSelected(new Set());
  }

  function handleRefresh() {
    fetchStokData(true);
  }

  function openEdit(item: StockItem) {
    setEditing(item);
    editForm.reset({
      kode: item.kode,
      nama: item.nama,
      qty: item.qty,
      hargaBeli: item.hargaBeli,
      hargaJual: item.hargaJual,
      warna: item.variantStock?.map((v) => v.name).join(", ") || item.warna.join(", "),
    });
  }

  function submitEdit(values: AddForm) {
    if (!editing) return;
    updateItem(editing.id, {
      nama: values.nama,
      qty: values.qty,
      hargaBeli: values.hargaBeli,
      hargaJual: values.hargaJual,
      variantStock: values.warna
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean)
        .map((w) => ({ name: w, qty: values.qty })),
      warna: values.warna
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
    });
    setEditing(null);
  }

  function submitAdd(values: AddForm) {
    addItem({
      id: "",
      kode: values.kode,
      nama: values.nama,
      qty: values.qty,
      hargaBeli: values.hargaBeli,
      hargaJual: values.hargaJual,
      warna: values.warna
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
      variantStock: values.warna
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean)
        .map((w) => ({ name: w, qty: values.qty })),
    });
    addForm.reset();
    setAdding(false);
  }

  const isLoading = loading || refreshing;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <ToastContainer toasts={toasts} />

      {/* Summary Cards - Compact */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div className="card" style={{ padding: "12px 16px" }}>
          <div className="muted small">Total Items</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{items.length}</div>
        </div>
        <div className="card" style={{ padding: "12px 16px" }}>
          <div className="muted small">Nilai Stok</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{formatIDR(totalValue)}</div>
        </div>
        <div className="card" style={{ padding: "12px 16px", background: lowCount > 0 ? "#fef3c7" : undefined, cursor: "pointer" }} onClick={() => setFilter("low")}>
          <div className="muted small">Stok Rendah</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#b45309" }}>{lowCount}</div>
        </div>
      </div>

      <div className="card">
        {/* Toolbar */}
        <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div className="flex" style={{ gap: 8, flex: 1, minWidth: 200 }}>
            <input
              className="input"
              placeholder="Cari kode atau nama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 300 }}
            />
            <button className="btn secondary" type="button" onClick={handleRefresh} style={{ whiteSpace: "nowrap" }}>
              {refreshing ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            {selected.size > 0 && (
              <button className="btn danger" onClick={deleteSelected}>
                Hapus ({selected.size})
              </button>
            )}
            <button className="btn secondary" onClick={() => setAdding(true)}>
              + Tambah
            </button>
            <button className="btn" onClick={() => exportStockCSV(items)}>
              Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ minWidth: 140 }}>
            <option value="all">Semua Stok</option>
            <option value="zero">Stok Habis</option>
            <option value="low">Stok Rendah</option>
            <option value="mid">Stok Sedang</option>
            <option value="ok">Stok Aman</option>
          </select>
          {uniqueColors.length > 0 && (
            <select className="select" value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} style={{ minWidth: 120 }}>
              <option value="">Semua Warna</option>
              {uniqueColors.slice(0, 20).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <select className="select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n} / halaman</option>
            ))}
          </select>
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={paged.length > 0 && paged.every((it) => selected.has(it.id))}
                    onChange={selectAllVisible}
                  />
                </th>
                <SortableHeader label="Kode" active={sort.key === "kode"} dir={sort.dir} onClick={() => toggleSort("kode")} />
                <SortableHeader label="Nama" active={sort.key === "nama"} dir={sort.dir} onClick={() => toggleSort("nama")} />
                <SortableHeader label="Stok" active={sort.key === "qty"} dir={sort.dir} onClick={() => toggleSort("qty")} />
                <SortableHeader label="Harga Beli" active={sort.key === "hargaBeli"} dir={sort.dir} onClick={() => toggleSort("hargaBeli")} />
                <SortableHeader label="Harga Jual" active={sort.key === "hargaJual"} dir={sort.dir} onClick={() => toggleSort("hargaJual")} />
                <th>Warna</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={8} style={{ padding: 12 }}>
                        <div className="skeleton" />
                      </td>
                    </tr>
                  ))
                : paged.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          onChange={() => toggleSelect(it.id)}
                        />
                      </td>
                      <td>{it.kode}</td>
                      <td>{it.nama}</td>
                      <td>
                        <span className={`badge ${stockBadge(it.qty)}`}>● {it.qty}</span>
                      </td>
                      <td>{formatIDR(it.hargaBeli)}</td>
                      <td>{formatIDR(it.hargaJual)}</td>
                      <td>
                        <ColorBadges item={it} />
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn secondary" onClick={() => openEdit(it)}>
                            Edit
                          </button>
                          <button className="btn danger" onClick={() => setConfirmDelete(it)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              {!isLoading && !paged.length && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 16 }}>
                    {fetchError ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ color: "#dc2626" }}>{fetchError}</div>
                        <button className="btn secondary" onClick={() => fetchStokData()}>
                          Coba Lagi
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: "2rem" }}>📦</div>
                        <div>Belum ada data stok</div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-card">
          {isLoading
            ? Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="card">
                  <div className="skeleton" />
                </div>
              ))
            : paged.map((it) => (
                <div key={it.id} className="card">
                  <div className="title">{it.nama}</div>
                  <div className="muted small">{it.kode}</div>
                  <div className="muted small">Stok: {it.qty}</div>
                  <div className="muted small">Harga beli: {formatIDR(it.hargaBeli)}</div>
                  <div className="muted small">Harga jual: {formatIDR(it.hargaJual)}</div>
                  <ColorBadges item={it} />
                  <div className="table-actions" style={{ marginTop: 8 }}>
                    <button className="btn secondary" onClick={() => openEdit(it)}>
                      Edit
                    </button>
                    <button className="btn danger" onClick={() => setConfirmDelete(it)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          {!isLoading && !paged.length && (
            fetchError ? (
              <div style={{ display: "grid", gap: 8, textAlign: "center", padding: 16 }}>
                <div style={{ color: "#dc2626" }}>{fetchError}</div>
                <button className="btn secondary" onClick={() => fetchStokData()}>
                  Coba Lagi
                </button>
              </div>
            ) : (
              <div className="muted" style={{ textAlign: "center", padding: 16 }}>
                📦 Belum ada data stok
              </div>
            )
          )}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
        />
      </div>

      {adding && (
        <Modal onClose={() => setAdding(false)} title="Tambah Produk">
          <form className="grid" style={{ gap: 10 }} onSubmit={addForm.handleSubmit(submitAdd)}>
            <InputField label="Kode" register={addForm.register("kode", { required: true })} />
            <InputField label="Nama" register={addForm.register("nama", { required: true })} />
            <InputField label="Qty" type="number" register={addForm.register("qty", { valueAsNumber: true, required: true })} />
            <InputField label="Harga Beli" type="number" register={addForm.register("hargaBeli", { valueAsNumber: true, required: true })} />
            <InputField label="Harga Jual" type="number" register={addForm.register("hargaJual", { valueAsNumber: true, required: true })} />
            <InputField label="Warna (pisah dengan koma)" register={addForm.register("warna")} />
            <div className="flex" style={{ justifyContent: "flex-end" }}>
              <button className="btn secondary" type="button" onClick={() => setAdding(false)}>
                Batal
              </button>
              <button className="btn" type="submit">
                Simpan
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title="Edit Produk">
          <form className="grid" style={{ gap: 10 }} onSubmit={editForm.handleSubmit(submitEdit)}>
            <InputField label="Kode" value={editing.kode} readOnly />
            <InputField label="Nama" register={editForm.register("nama", { required: true })} />
            <InputField label="Stok" type="number" register={editForm.register("qty", { valueAsNumber: true })} />
            <InputField label="Harga Beli" type="number" register={editForm.register("hargaBeli", { valueAsNumber: true })} />
            <InputField label="Harga Jual" type="number" register={editForm.register("hargaJual", { valueAsNumber: true })} />
            <InputField label="Warna (pisah dengan koma)" register={editForm.register("warna")} />
            <div className="flex" style={{ justifyContent: "flex-end" }}>
              <button className="btn secondary" type="button" onClick={() => setEditing(null)}>
                Batal
              </button>
              <button className="btn" type="submit">
                Simpan Perubahan
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} title="Konfirmasi Hapus">
          <p>Yakin hapus {confirmDelete.nama}?</p>
          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn secondary" onClick={() => setConfirmDelete(null)}>
              Batal
            </button>
            <button
              className="btn danger"
              onClick={() => {
                removeItem(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Hapus
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
  action,
}: {
  title: string;
  value: number | string;
  tone?: "alert";
  action?: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        background: tone === "alert" ? "#fff4e5" : "#ffffff",
        borderColor: tone === "alert" ? "#f59e0b" : undefined,
      }}
    >
      <div className="muted">{title}</div>
      <div
        style={{
          fontSize: "1.6rem",
          fontWeight: 800,
          color: tone === "alert" ? "#b45309" : "#0f172a",
        }}
      >
        {value}
      </div>
      {action && (
        <button className="btn secondary" style={{ marginTop: 8 }} onClick={action}>
          Lihat stok rendah
        </button>
      )}
    </div>
  );
}

function ColorBadges({ item }: { item: StockItem }) {
  const colors = item.variantStock?.map((v) => v.name) ?? item.warna;
  const toShow = colors.slice(0, 3);
  const rest = colors.length - toShow.length;
  const tooltip = colors.join(", ");
  return (
    <div className="pill-group">
      {toShow.map((w) => (
        <span key={w} className="tag" title={tooltip}>
          {w}
        </span>
      ))}
      {rest > 0 && (
        <span className="tag" title={tooltip}>
          +{rest} lainnya
        </span>
      )}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(totalItems, currentPage * pageSize);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5);
  return (
    <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
      <div className="muted small">
        Showing {start}-{end} of {totalItems} items
      </div>
      <div className="flex">
        <button className="btn secondary" disabled={currentPage === 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))}>
          Previous
        </button>
        {pages.map((p) => (
          <button
            key={p}
            className={`btn secondary ${p === currentPage ? "active-page" : ""}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}
        <button className="btn secondary" disabled={currentPage === totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>
          Next
        </button>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th style={{ cursor: "pointer" }} onClick={onClick}>
      {label} {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
    </th>
  );
}

function Modal({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ marginTop: 0 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function InputField({
  label,
  register,
  type,
  readOnly,
  value,
}: {
  label: string;
  register?: any;
  type?: string;
  readOnly?: boolean;
  value?: string | number;
}) {
  return (
    <label className="grid" style={{ gap: 4 }}>
      <span className="muted">{label}</span>
      <input
        className="input"
        type={type || "text"}
        readOnly={readOnly}
        value={value}
        {...register}
      />
    </label>
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
