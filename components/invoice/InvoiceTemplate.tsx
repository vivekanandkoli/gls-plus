import { formatCurrency, formatDate } from "@/lib/utils";
import type { Client, Invoice } from "@/lib/types";

export function InvoiceTemplate({
  invoice,
  client,
}: {
  invoice: Invoice;
  client: Client;
}) {
  const subtotal = invoice.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  return (
    <div className="w-full bg-white p-8 text-black">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-2xl font-bold" style={{ color: "#B8860B" }}>
            Invoice
          </div>
          <div className="mt-1 text-sm text-black/70">
            Invoice #: <span className="font-mono">{invoice.invoiceNumber}</span>
          </div>
          <div className="text-sm text-black/70">
            Issued: {formatDate(invoice.issuedAt)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">Bill to</div>
          <div className="text-sm">{client.name}</div>
          {client.email ? (
            <div className="text-sm text-black/70">{client.email}</div>
          ) : null}
          {client.phone ? (
            <div className="text-sm text-black/70">{client.phone}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-black/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/5">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-t border-black/10">
                <td className="px-4 py-3">{item.description}</td>
                <td className="px-4 py-3 text-right">{item.quantity}</td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(item.unitPrice, "USD")}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(item.quantity * item.unitPrice, "USD")}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/10 bg-black/5">
              <td className="px-4 py-3 font-semibold" colSpan={3}>
                Subtotal
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                {formatCurrency(subtotal, "USD")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

