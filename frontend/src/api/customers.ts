import { apiRequest, jsonBody } from "./client";
import { toQueryString, type ListParams } from "./listParams";
import type { Customer, Page } from "./types";

/** Campos que o formulário envia (texto livre; o backend normaliza e valida). */
export interface CustomerData {
  name: string;
  document: string;
  phone: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
  notes: string;
}

export function listCustomers(params: ListParams) {
  return apiRequest<Page & { customers: Customer[] }>(`/customers${toQueryString(params)}`);
}

export function createCustomer(data: CustomerData) {
  return apiRequest<{ customer: Customer }>("/customers", jsonBody("POST", data));
}

export function updateCustomer(id: string, data: Partial<CustomerData> & { active?: boolean }) {
  return apiRequest<{ customer: Customer }>(`/customers/${id}`, jsonBody("PATCH", data));
}
