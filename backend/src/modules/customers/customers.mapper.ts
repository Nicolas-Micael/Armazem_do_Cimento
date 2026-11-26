import type { Customer } from "../../generated/prisma/client.js";

/** Formato do cliente enviado pela API. */
export function toPublicCustomer(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    document: customer.document,
    phone: customer.phone,
    street: customer.street,
    number: customer.number,
    complement: customer.complement,
    district: customer.district,
    city: customer.city,
    state: customer.state,
    zipCode: customer.zipCode,
    notes: customer.notes,
    active: customer.active,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

/** Campos guardados na auditoria (antes/depois de uma alteração). */
export function customerAuditSnapshot(customer: Customer) {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = toPublicCustomer(customer);
  return rest;
}
