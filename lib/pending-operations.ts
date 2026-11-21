import type { PendingOperation, PendingOperationSource, Customer, TelecomCompany } from '@/types';
import { extractSimNumbers, guessCompanyFromMessage, guessBundleFromMessage } from './sms-parser';
import { parseTransferSms } from './transfer-parser';

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
  const transferParsed = parseTransferSms(message);

  let operationType: PendingOperation['operationType'] = 'unknown';
  if (transferParsed.isTransfer) {
    operationType = 'transfer';
  } else if (primarySimNumber) {
    operationType = 'recharge';
  }

  if (!primarySimNumber && !transferParsed.isTransfer) return null;

  const simNumber = primarySimNumber || '';
  const matchedCustomer = customers.find(
    (c) => c.phone === senderPhone || c.phone === simNumber,
  );

  const companyGuess = guessCompanyFromMessage(message, companies);
  const { bundleName } = guessBundleFromMessage(message);

  return {
    id: generateId(),
    operationType,
    source,
    senderPhone,
    senderName: senderName || (matchedCustomer?.name ?? ''),
    simNumber,
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
