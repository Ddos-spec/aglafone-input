// Ambil webhook URLs dari environment variables
const WEBHOOK_PENJUALAN = import.meta.env.VITE_N8N_WEBHOOK_PENJUALAN;
const WEBHOOK_PEMBELIAN = import.meta.env.VITE_N8N_WEBHOOK_PEMBELIAN;
const WEBHOOK_STOK = import.meta.env.VITE_N8N_WEBHOOK_STOK;
const WEBHOOK_RIWAYAT_PENJUALAN = import.meta.env.VITE_N8N_WEBHOOK_RIWAYAT_PENJUALAN;
const WEBHOOK_RIWAYAT_PEMBELIAN = import.meta.env.VITE_N8N_WEBHOOK_RIWAYAT_PEMBELIAN;

const warnMissingEnv = (name: string, value: string | undefined) => {
  if (!value && import.meta.env.DEV) {
    console.warn(`[ENV WARNING] ${name} belum dikonfigurasi.`);
  }
};

warnMissingEnv("VITE_N8N_WEBHOOK_PENJUALAN", WEBHOOK_PENJUALAN);
warnMissingEnv("VITE_N8N_WEBHOOK_PEMBELIAN", WEBHOOK_PEMBELIAN);
warnMissingEnv("VITE_N8N_WEBHOOK_STOK", WEBHOOK_STOK);
warnMissingEnv("VITE_N8N_WEBHOOK_RIWAYAT_PENJUALAN", WEBHOOK_RIWAYAT_PENJUALAN);
warnMissingEnv("VITE_N8N_WEBHOOK_RIWAYAT_PEMBELIAN", WEBHOOK_RIWAYAT_PEMBELIAN);

// Export endpoints
export const API_ENDPOINTS = {
  penjualan: WEBHOOK_PENJUALAN,
  pembelian: WEBHOOK_PEMBELIAN,
  stok: WEBHOOK_STOK,
  riwayatPenjualan: WEBHOOK_RIWAYAT_PENJUALAN,
  riwayatPembelian: WEBHOOK_RIWAYAT_PEMBELIAN,
} as const;

type ApiCallOptions = {
  timeoutMs?: number;
  headers?: Record<string, string>;
};

const DEFAULT_TIMEOUT_MS = 30000;

const mapNetworkErrorMessage = (error: any) => {
  if (error?.name === "AbortError") return "Permintaan timeout, coba lagi.";
  if (error instanceof TypeError) return "Koneksi gagal atau CORS error.";
  return error?.message || "Terjadi kesalahan jaringan.";
};

type RequestMethod = "GET" | "POST";

const requestWithTimeout = async <TResponse>(
  endpoint: string | undefined,
  method: RequestMethod,
  data?: unknown,
  options?: ApiCallOptions,
): Promise<TResponse> => {
  if (!endpoint) {
    throw new Error("Endpoint webhook belum dikonfigurasi.");
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: method === "POST" ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed: any = null;
    let parseFailed = false;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parseFailed = true;
      }
    }

    if (!response.ok) {
      const message = parsed?.message || rawText || `Server error (${response.status})`;
      const err = new Error(message);
      (err as any).status = response.status;
      throw err;
    }

    if (parseFailed) {
      throw new Error("Respon server tidak valid.");
    }

    if (parsed && typeof parsed === "object" && "success" in parsed && parsed.success === false) {
      const err = new Error(parsed.message || "Permintaan gagal.");
      (err as any).response = parsed;
      throw err;
    }

    return parsed as TResponse;
  } catch (error: any) {
    const msg = mapNetworkErrorMessage(error);
    if (import.meta.env.DEV) {
      console.error("API Error:", error);
    }
    throw new Error(msg);
  } finally {
    clearTimeout(timeoutId);
  }
};

// Helper POST (backward compatible)
export const apiCall = async <TResponse>(
  endpoint: string | undefined,
  data: unknown,
  options?: ApiCallOptions,
): Promise<TResponse> => requestWithTimeout<TResponse>(endpoint, "POST", data, options);

// Helper GET untuk tarik data (stok/riwayat)
export const apiGet = async <TResponse>(
  endpoint: string | undefined,
  options?: ApiCallOptions,
): Promise<TResponse> => requestWithTimeout<TResponse>(endpoint, "GET", undefined, options);
