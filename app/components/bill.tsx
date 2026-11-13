import { formatMoney } from "@/lib/ui-api";
import { Bill } from "@/lib/ui-models";

export function BillView({ bill, am = false }: { bill: Bill; am?: boolean }) {
  const money = (value: string) => formatMoney(value, bill.currency);
  const rows = [
    [am ? "ንዑስ ድምር" : "Subtotal", bill.subtotal_minor],
    [
      am ? "ቅናሽ" : "Discount",
      bill.discount_minor === "0" ? "0" : "-" + bill.discount_minor,
    ],
    [am ? "ግብር" : "Tax", bill.tax_minor],
    [am ? "የአገልግሎት ክፍያ" : "Service charge", bill.service_minor],
    [am ? "ጉርሻ" : "Optional tip", bill.tip_minor],
  ];
  return (
    <div className="receipt">
      <h3>{am ? "የታዘዙ ዕቃዎች" : "Bill items"}</h3>
      {bill.lines?.map((line, i) => (
        <div className="line" key={line.id ?? i}>
          <span>
            {line.quantity} × {line.name}
          </span>
          <span className="amount">
            {money(
              (BigInt(line.quantity) * BigInt(line.unit_minor ?? 0)).toString(),
            )}
          </span>
        </div>
      ))}
      {rows.map(([name, value]) => (
        <div className="total-row" key={name}>
          <span>{name}</span>
          <span>{money(value)}</span>
        </div>
      ))}
      <div className="total-row">
        <strong>{am ? "ድምር" : "Total due"}</strong>
        <strong>{money(bill.total_minor)}</strong>
      </div>
    </div>
  );
}
