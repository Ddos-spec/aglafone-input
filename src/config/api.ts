// Ambil webhook URLs dari environment variables
const WEBHOOK_PENJUALAN = import.meta.env.VITE_N8N_WEBHOOK_PENJUALAN;
const WEBHOOK_PEMBELIAN = import.meta.env.VITE_N8N_WEBHOOK_PEMBELIAN;
const WEBHOOK_STOK = import.meta.env.VITE_N8N_WEBHOOK_STOK;

// Export endpoints
export const API_ENDPOINTS = {
  penjualan: WEBHOOK_PENJUALAN,
  pembelian: WEBHOOK_PEMBELIAN,
  stok: WEBHOOK_STOK,
} as const;

// Helper function untuk API calls
export const apiCall = async <TResponse>(endpoint: string, data: unknown): Promise<TResponse> => {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return (await response.json()) as TResponse;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};
