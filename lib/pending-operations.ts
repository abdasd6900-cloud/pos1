import type { PendingOperation, PendingOperationSource, Customer, TelecomCompany } from '@/types';
import { extractSimNumbers, guessCompanyFromMessage, guessBundleFromMessage } from './sms-parser';

export function createPendingOperationFromMessage(
  message: string,
  senderPhone: string,
  senderName: string,
  source: PendingOperationSource,
  customers: Customer[],
  companies: TelecomCompany[],
  generateId: () => string,
): PendingOperation | null {
  const { primarySimNumber } = extractSimNumbers(message);
  if (!primarySimNumber) return null;

  const matchedCustomer = customers.find(
    (c) => c.phone === senderPhone || c.phone === primarySimNumber,
  );

  const companyGuess = guessCompanyFromMessage(message, companies);
  const { bundleName } = guessBundleFromMessage(message);

  return {
    id: generateId(),
    source,
    senderPhone,
    senderName: senderName || (matchedCustomer?.name ?? ''),
    simNumber: primarySimNumber,
    originalMessage: message,
    status: 'pending',
    customerMatched: !!matchedCustomer,
    customerId: matchedCustomer?.id ?? null,
    customerName: matchedCustomer?.name ?? senderName ?? '',
    customerPhone: senderPhone,
    companyGuess,
    bundleGuess: bundleName,
    createdAt: Date.now(),
    executedAt: null,
    transferReportId: null,
    transferNotificationId: null,
    transferStatus: 'none' as const,
    chargeDuration: null,
    companyName: null,
  };
}

export function getPendingOps(ops: PendingOperation[]): PendingOperation[] {
  return ops.filter((o) => o.status === 'pending');
}

export function getExecutedOps(ops: PendingOperation[]): PendingOperation[] {
  return ops.filter((o) => o.status !== 'pending');
}
