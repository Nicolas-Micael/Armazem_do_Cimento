import type { OrderStatus } from "../../api/orders";
import { ORDER_STATUS_LABELS } from "../../lib/labels";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{ORDER_STATUS_LABELS[status]}</span>;
}
