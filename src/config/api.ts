// Ambil webhook URL dari environment variable
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';

// Export endpoints
export const API_ENDPOINTS = {
  penjualan: `${N8N_WEBHOOK_URL}/penjualan`,
  pembelian: `${N8N_WEBHOOK_URL}/pembelian`,
  stok: `${N8N_WEBHOOK_URL}/stok`,
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
