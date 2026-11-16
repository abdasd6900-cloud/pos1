import type { TelecomSale, DebtEscalationState, EscalationPhase, FreezeRequest, DebtReminderSchedule } from '@/types';
import {
  parseCustomerReply,
  buildAskForDateMessage,
  buildFreezeWarningMessage,
  buildReminderMessage,
  shouldEscalateToFreeze,
} from './reply-parser';

const DAY_MS = 86400000;
const MAX_REMINDERS = 3;

export function createEscalationState(sale: TelecomSale): DebtEscalationState {
  return {
    saleId: sale.id,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    simNumber: sale.simNumber,
    companyName: sale.companyName,
    remaining: sale.remaining,
    phase: 'reminding',
    remindersSent: 0,
    maxRemindersBeforeFreeze: MAX_REMINDERS,
    lastReminderAt: null,
    nextReminderAt: Date.now() + DAY_MS,
    customerReplyDate: null,
    customerReplyText: '',
    awaitingReplySince: null,
    reactivationReason: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function processReminderTick(
  state: DebtEscalationState,
  currency: string,
): { newState: DebtEscalationState; messageToSend: string | null } {
  if (state.phase === 'frozen' || state.phase === 'reactivated') {
    return { newState: state, messageToSend: null };
  }

  if (state.phase === 'freeze_pending') {
    return { newState: state, messageToSend: null };
  }

  const now = Date.now();
  if (state.nextReminderAt === null || now < state.nextReminderAt) {
    return { newState: state, messageToSend: null };
  }

  const nextCount = state.remindersSent + 1;

  if (shouldEscalateToFreeze(nextCount, state.maxRemindersBeforeFreeze)) {
    const newState: DebtEscalationState = {
      ...state,
      phase: 'freeze_pending',
      remindersSent: nextCount,
      lastReminderAt: now,
      nextReminderAt: null,
      updatedAt: now,
    };
    const msg = buildFreezeWarningMessage(state.customerName);
    return { newState, messageToSend: msg };
  }

  const msg = buildReminderMessage(state.customerName, state.remaining, currency, nextCount);
  const newState: DebtEscalationState = {
    ...state,
    remindersSent: nextCount,
    lastReminderAt: now,
    nextReminderAt: now + DAY_MS,
    updatedAt: now,
  };
  return { newState, messageToSend: msg };
}

export function processCustomerReply(
  state: DebtEscalationState,
  replyText: string,
): {
  newState: DebtEscalationState;
  messageToSend: string | null;
  createFreezeRequest: boolean;
  createPendingOp: boolean;
  pendingOpReason: string;
} {
  const parsed = parseCustomerReply(replyText);
  const now = Date.now();

  if (parsed.isPayingNow) {
    const newState: DebtEscalationState = {
      ...state,
      phase: 'reactivated',
      customerReplyText: replyText,
      customerReplyDate: now,
      reactivationReason: 'قام الزبون بالدفع',
      awaitingReplySince: null,
      nextReminderAt: null,
      updatedAt: now,
    };
    return {
      newState,
      messageToSend: null,
      createFreezeRequest: false,
      createPendingOp: true,
      pendingOpReason: 'قام الزبون بالدفع',
    };
  }

  if (parsed.hasDate) {
    const newState: DebtEscalationState = {
      ...state,
      phase: 'awaiting_reply',
      customerReplyText: replyText,
      customerReplyDate: parsed.timestamp,
      awaitingReplySince: now,
      nextReminderAt: parsed.timestamp ?? null,
      reactivationReason: 'حدد الزبون موعد للدفع',
      updatedAt: now,
    };
    return {
      newState,
      messageToSend: null,
      createFreezeRequest: false,
      createPendingOp: true,
      pendingOpReason: 'حدد الزبون موعد للدفع',
    };
  }

  if (parsed.isAskingForExtension && !parsed.hasDate) {
    const msg = buildAskForDateMessage(state.customerName);
    const newState: DebtEscalationState = {
      ...state,
      phase: 'awaiting_reply',
      customerReplyText: replyText,
      awaitingReplySince: now,
      nextReminderAt: now + DAY_MS,
      updatedAt: now,
    };
    return {
      newState,
      messageToSend: msg,
      createFreezeRequest: false,
      createPendingOp: false,
      pendingOpReason: '',
    };
  }

  const newState: DebtEscalationState = {
    ...state,
    customerReplyText: replyText,
    updatedAt: now,
  };
  return {
    newState,
    messageToSend: null,
    createFreezeRequest: false,
    createPendingOp: false,
    pendingOpReason: '',
  };
}

export function executeFreeze(state: DebtEscalationState): DebtEscalationState {
  return {
    ...state,
    phase: 'frozen',
    updatedAt: Date.now(),
  };
}

export function reactivateFromPaymentOrPromise(
  state: DebtEscalationState,
  reason: string,
): DebtEscalationState {
  return {
    ...state,
    phase: 'reactivated',
    reactivationReason: reason,
    awaitingReplySince: null,
    nextReminderAt: null,
    updatedAt: Date.now(),
  };
}

export function createFreezeRequestFromState(state: DebtEscalationState, generateId: () => string): FreezeRequest {
  return {
    id: generateId(),
    saleId: state.saleId,
    customerName: state.customerName,
    customerPhone: state.customerPhone,
    simNumber: state.simNumber,
    companyName: state.companyName,
    remaining: state.remaining,
    remindersSent: state.remindersSent,
    status: 'pending',
    executedAt: null,
    createdAt: Date.now(),
  };
}

export function getSalesNeedingReminders(sales: TelecomSale[]): TelecomSale[] {
  return sales.filter((s) => {
    if (!s.escalationState) return false;
    const st = s.escalationState;
    if (st.phase === 'frozen' || st.phase === 'reactivated' || st.phase === 'freeze_pending') return false;
    if (st.phase === 'awaiting_reply' && st.customerReplyDate) {
      return st.customerReplyDate <= Date.now();
    }
    return st.nextReminderAt !== null && st.nextReminderAt <= Date.now();
  });
}

export function getSalesPendingFreeze(sales: TelecomSale[]): TelecomSale[] {
  return sales.filter((s) => s.escalationState?.phase === 'freeze_pending');
}

export function getSalesReactivated(sales: TelecomSale[]): TelecomSale[] {
  return sales.filter((s) => s.escalationState?.phase === 'reactivated');
}

export function findEscalationByPhone(
  sales: TelecomSale[],
  phone: string,
): { sale: TelecomSale; state: DebtEscalationState } | null {
  for (const sale of sales) {
    if (!sale.escalationState) continue;
    if (sale.escalationState.phase === 'frozen' || sale.escalationState.phase === 'reactivated') continue;
    if (sale.customerPhone === phone || sale.escalationState.customerPhone === phone) {
      return { sale, state: sale.escalationState };
    }
  }
  return null;
}
