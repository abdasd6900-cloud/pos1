import type { Customer, PendingOperation, TelecomSale, Transaction } from '@/types';
import { normalizeName } from './name-matcher';
import { normalizePhoneNumber } from './format';

export interface CustomerFile {
  id: string;
  name: string;
  primaryCustomerId: string | null;
  customerIds: string[];
  phoneNumbers: string[];
  simNumbers: string[];
  transactionIds: string[];
  telecomSaleIds: string[];
  pendingOperationIds: string[];
  createdAt: number;
  updatedAt: number;
}

type FileDraft = Omit<CustomerFile, 'createdAt' | 'updatedAt'> & { key: string };

type ProfileSource = {
  customerId?: string | null;
  name?: string | null;
  phone?: string | null;
};

function cleanPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  return normalizePhoneNumber(phone.trim());
}

function cleanName(name: string | null | undefined): string | null {
  const value = name?.trim();
  return value ? value : null;
}

function sourceKey(source: ProfileSource, phoneToKey: Map<string, string>, nameToKey: Map<string, string>, idToKey: Map<string, string>): string {
  if (source.customerId && idToKey.has(source.customerId)) return idToKey.get(source.customerId)!;
  const name = cleanName(source.name);
  const normalizedName = name ? normalizeName(name) : '';
  if (normalizedName && normalizedName !== normalizeName('زبون جديد') && nameToKey.has(normalizedName)) {
    return nameToKey.get(normalizedName)!;
  }
  const phone = cleanPhone(source.phone);
  if (phone && phoneToKey.has(phone)) return phoneToKey.get(phone)!;
  if (source.customerId) return `customer:${source.customerId}`;
  if (normalizedName && normalizedName !== normalizeName('زبون جديد')) return `name:${normalizedName}`;
  if (phone) return `phone:${phone}`;
  return `unknown:${Date.now()}:${Math.random()}`;
}

export function buildCustomerFiles(
  customers: Customer[],
  transactions: Transaction[],
  telecomSales: TelecomSale[],
  pendingOperations: PendingOperation[],
  existingFiles: CustomerFile[] = [],
): CustomerFile[] {
  const files = new Map<string, FileDraft>();
  const phoneToKey = new Map<string, string>();
  const nameToKey = new Map<string, string>();
  const idToKey = new Map<string, string>();
  const now = Date.now();

  const ensure = (source: ProfileSource): FileDraft => {
    const key = sourceKey(source, phoneToKey, nameToKey, idToKey);
    let file = files.get(key);
    if (!file) {
      const name = cleanName(source.name) ?? 'زبون بدون اسم';
      file = {
        key,
        id: existingFiles.find((item) => item.id === key)?.id ?? `customer-file-${key}`,
        name,
        primaryCustomerId: source.customerId ?? null,
        customerIds: [],
        phoneNumbers: [],
        simNumbers: [],
        transactionIds: [],
        telecomSaleIds: [],
        pendingOperationIds: [],
      };
      files.set(key, file);
    }
    const name = cleanName(source.name);
    const phone = cleanPhone(source.phone);
    if (name && file.name === 'زبون بدون اسم') file.name = name;
    if (source.customerId && !file.customerIds.includes(source.customerId)) file.customerIds.push(source.customerId);
    if (source.customerId) idToKey.set(source.customerId, key);
    if (phone && !file.phoneNumbers.includes(phone)) file.phoneNumbers.push(phone);
    if (phone) phoneToKey.set(phone, key);
    if (name) nameToKey.set(normalizeName(name), key);
    return file;
  };

  customers.forEach((customer) => ensure({ customerId: customer.id, name: customer.name, phone: customer.phone }));

  telecomSales.forEach((sale) => {
    const file = ensure({ customerId: sale.customerId, name: sale.customerName, phone: sale.customerPhone });
    if (!file.telecomSaleIds.includes(sale.id)) file.telecomSaleIds.push(sale.id);
    if (sale.simNumber && !file.simNumbers.includes(sale.simNumber)) file.simNumbers.push(sale.simNumber);
  });

  pendingOperations.forEach((operation) => {
    const file = ensure({ customerId: operation.customerId, name: operation.customerName, phone: operation.customerPhone || operation.senderPhone });
    if (!file.pendingOperationIds.includes(operation.id)) file.pendingOperationIds.push(operation.id);
    if (operation.simNumber && !file.simNumbers.includes(operation.simNumber)) file.simNumbers.push(operation.simNumber);
  });

  transactions.forEach((transaction) => {
    if (!transaction.customerId && !transaction.customerName.trim()) return;
    const file = ensure({ customerId: transaction.customerId, name: transaction.customerName });
    if (!file.transactionIds.includes(transaction.id)) file.transactionIds.push(transaction.id);
  });

  return Array.from(files.values())
    .map(({ key, ...file }) => {
      const previous = existingFiles.find((item) => item.id === file.id || item.id === `customer-file-${key}`);
      return {
        ...file,
        id: previous?.id ?? file.id,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}
