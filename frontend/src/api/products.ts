import { apiRequest, jsonBody } from "./client";
import { toQueryString, type ListParams } from "./listParams";
import type { Page, PriceHistoryEntry, Product } from "./types";

export interface ProductData {
  name: string;
  brand: string;
  cementType: string;
  /** Texto no formato da API, ex.: "38.90". */
  currentPrice: string;
}

export function listProducts(params: ListParams) {
  return apiRequest<Page & { products: Product[] }>(`/products${toQueryString(params)}`);
}

export function createProduct(data: ProductData) {
  return apiRequest<{ product: Product }>("/products", jsonBody("POST", data));
}

export function updateProduct(id: string, data: Partial<ProductData> & { active?: boolean }) {
  return apiRequest<{ product: Product }>(`/products/${id}`, jsonBody("PATCH", data));
}

export function getPriceHistory(id: string) {
  return apiRequest<{ history: PriceHistoryEntry[] }>(`/products/${id}/price-history`);
}
