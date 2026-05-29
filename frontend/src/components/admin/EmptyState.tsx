import { Icon, Package, FileText, Wrench, Users, CurrencyCircleDollar, Tag, Cube, Clock } from "@phosphor-icons/react";

const iconMap: Record<string, React.ElementType> = {
  products: Package,
  orders: FileText,
  bookings: Wrench,
  customers: Users,
  payments: CurrencyCircleDollar,
  categories: Tag,
  rfqs: FileText,
  quotations: FileText,
  default: Cube,
};

export default function EmptyState({
  icon = "default",
  title = "Nothing here yet",
  description,
  action,
}: {
  icon?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const IconComponent = iconMap[icon] || iconMap.default;
  return (
    <div className="mt-12 flex flex-col items-center gap-3 text-center">
      <IconComponent size={48} className="text-muted" weight="light" />
      <p className="text-sm text-soft">{title}</p>
      {description && <p className="text-xs text-muted max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
