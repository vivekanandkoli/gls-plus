export type Id = string;

export interface Client {
  id: Id;
  name: string;
  email?: string;
  phone?: string;
  createdAt?: string;
}

export interface Transaction {
  id: Id;
  clientId: Id;
  date: string;
  amount: number;
  currency?: string;
  notes?: string;
}

export interface InvoiceLineItem {
  id: Id;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: Id;
  invoiceNumber: string;
  clientId: Id;
  issuedAt: string;
  dueAt?: string;
  items: InvoiceLineItem[];
  notes?: string;
}

