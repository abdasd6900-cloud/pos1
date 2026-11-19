import type { TelecomSale, TelecomCompany, AutoReplyTemplates, KeywordReply, Bundle, AgentBundle } from '@/types';
import { DEFAULT_AUTO_REPLY_TEMPLATES } from '@/types';
import { detectChargeDuration, findCompanyBySimNumber, COMPANIES_REQUIRING_DURATION } from './sms-parser';
import {
  isEsimRequest, isAdviceRequest, extractPhoneModel, checkEsimCompatibility,
} from './esim-checker';

const DAY_MS = 86400000;

const CHARGE_DURATION_DAYS: Record<string, number> = {
  '3_days': 3,
  week: 7,
  '2_weeks': 14,
  '3_weeks': 21,
  month: 30,
  '2_months': 60,
  '3_months': 90,
  offer: 30,
};

export interface CustomerMatch {
  sale: TelecomSale;
  company: TelecomCompany | null;
  daysRemaining: number;
  hasActiveCharge: boolean;
}

export function findCustomerByPhone(sales: TelecomSale[], phone: string, senderName?: string): CustomerMatch | null {
  const normalized = normalizePhone(phone);
  const matching = sales
    .filter((s) => s.customerPhone === normalized || s.customerPhone === phone)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (matching.length === 0 && senderName?.trim()) {
    const name = senderName.trim().toLocaleLowerCase();
    const nameMatching = sales
      .filter((s) => s.customerName?.trim().toLocaleLowerCase() === name)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (nameMatching.length > 0) {
      const sale = nameMatching[0];
      const durationDays = CHARGE_DURATION_DAYS[sale.chargeDuration] ?? 30;
      const elapsed = Math.floor((Date.now() - sale.createdAt) / DAY_MS);
      const daysRemaining = durationDays - elapsed;
      return { sale, company: null, daysRemaining, hasActiveCharge: daysRemaining > 0 };
    }
  }
  if (matching.length === 0) return null;
  const sale = matching[0];
  const durationDays = CHARGE_DURATION_DAYS[sale.chargeDuration] ?? 30;
  const elapsed = Math.floor((Date.now() - sale.createdAt) / DAY_MS);
  const daysRemaining = durationDays - elapsed;
  return {
    sale,
    company: null,
    daysRemaining,
    hasActiveCharge: daysRemaining > 0,
  };
}

export function findCustomerBySerial(sales: TelecomSale[], text: string): CustomerMatch | null {
  const needle = text.replace(/[^0-9A-Za-z]/g, '').toLowerCase().trim();
  if (needle.length < 4) return null;
  const matching = sales
    .filter((s) => {
      const serial = (s.serialNumber || '').replace(/[^0-9A-Za-z]/g, '').toLowerCase();
      if (!serial) return false;
      return serial.includes(needle) || needle.includes(serial);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  if (matching.length === 0) return null;
  const sale = matching[0];
  const durationDays = CHARGE_DURATION_DAYS[sale.chargeDuration] ?? 30;
  const elapsed = Math.floor((Date.now() - sale.createdAt) / DAY_MS);
  const daysRemaining = durationDays - elapsed;
  return {
    sale,
    company: null,
    daysRemaining,
    hasActiveCharge: daysRemaining > 0,
  };
}

export function enrichWithCompany(match: CustomerMatch, companies: TelecomCompany[]): CustomerMatch {
  const company = companies.find((c) => c.id === match.sale.companyId) ?? null;
  return { ...match, company };
}

// Internet problem keywords
const INTERNET_PROBLEM_KEYWORDS = [
  'ما عاد يشتغل النت', 'ما عاد يشتغل الانترنت', 'النت ما عاد يشتغل', 'الانترنت ما عاد يشتغل',
  'النت مقطوع', 'الانترنت مقطوع', 'النت ضعيف', 'الانترنت ضعيف', 'لا يوجد نت', 'لا يوجد انترنت',
  'لا يوجد اتصال', 'ما في نت', 'ما في انترنت', 'مشكلة في النت', 'مشكلة في الانترنت',
  'مشكلة بالنت', 'مشكلة بالانترنت', 'النت بطيء', 'الانترنت بطيء', 'ما يشتغل النت',
  'ما يشتغل الانترنت', 'انقطع النت', 'انقطع الانترنت', 'تعطل النت', 'تعطل الانترنت',
  'النت توقف', 'الانترنت توقف', 'ما في اشارة', 'ما في إشارة', 'لا توجد إشارة', 'لا توجد اشارة',
  'الشريحة ما تشتغل', 'ما تشتغل الشريحة', 'تعطلت الشريحة', 'الشريحة معطلة',
  'ما يفتح النت', 'ما يفتح الانترنت', 'النت ما يفتح', 'ما يقبل التصفح', 'لا يقبل التصفح',
  'مشكلة في الباقة', 'مشكلة بالباقة', 'الباقة ما تشتغل', 'ما تشتغل الباقة',
  'انتهت الباقة', 'خلصت الباقة', 'ما في باقة', 'لا يوجد باقة',
  'لا يعمل النت', 'لا يعمل الانترنت', 'النت لا يعمل', 'الانترنت لا يعمل',
  'انترنت ضعيف جدا', 'نت ضعيف جدا', 'مشكلة اتصال', 'مشكلة في الاتصال',
  'صعوبة في الاتصال', 'ما يتصل النت', 'لا يتصل النت', 'فقدان الاتصال',
  'تم قطع الانترنت', 'تم قطع النت', ' disconnect', 'no internet', 'net problem',
  'فش نت', 'فش انترنت', 'فش الإنترنت', 'فش نت في الشريحة', 'فش نت في الشريحه',
  'فش انترنت في الشريحة', 'فش انترنت في الشريحه', 'فش شبكة', 'فش شبكه',
  'فش اشارة', 'فش إشارة', 'فش اتصال', 'ما فش نت', 'ما فش انترنت',
  'النت فش', 'الانترنت فش', 'فش خدمة', 'فش خدمه', 'فش باقة', 'فش باقه',
  'الشريحة فش فيها نت', 'الشريحه فش فيها نت', 'فش فيها نت', 'فش فيها انترنت',
];

// Recharge request keywords — customer asking to renew/recharge their subscription
const RECHARGE_KEYWORDS = [
  'شحن', 'شحن رقم', 'شحن الشريحة', 'تجديد', 'تجديد اشتراك', 'تجديد الرقم',
  'بدي شحن', 'ابغى شحن', 'اريد شحن', 'اشحن', 'شحن لي', 'شحن رقمي',
  'بدي تجديد', 'ابغى تجديد', 'اريد تجديد', 'جدد', 'جدد لي', 'جدد اشتراكي',
  'باقة جديدة', 'بدي باقة', 'ابغى باقة', 'اريد باقة', 'اشترك',
  'مطلوب شحن', 'مطلوب تجديد', 'شحن من فضلك', 'شحن لو سمحت',
  'شحن رصيد', 'بدي رصيد', 'ابغى رصيد', 'اريد رصيد',
  'ضيف رصيد', 'ضيف لي رصيد', 'اضف رصيد', 'اضافه رصيد', 'إضافة رصيد',
  'بدي اشحن', 'بدي احط رصيد', 'بدي اركب رصيد', 'بدي احط نت ع الشريحه', 'بدي احط نت ع الشريحة',
  'ابغى احط رصيد', 'ابغى اركب رصيد', 'ابغى احط نت', 'اريد احط رصيد',
  'حط لي رصيد', 'حط لي نت', 'اركب لي رصيد', 'ركب لي نت',
  'احط رصيد', 'اركب رصيد', 'حط نت', 'اركب نت',
  'اكمل', 'أكمل', 'اكمل الباقة', 'أكمل الباقة', 'كمّل', 'كمّل الباقة',
  'استمرار', 'بدي استمر', 'استمرار الباقة',
  'recharge', 'renew', 'refresh', 'bundle',
];

// Urgency keywords — customer sending a follow-up/urgent message
const URGENCY_KEYWORDS = [
  'بسرعة', 'بسرعه', 'عاجل', 'مستعجل', 'سريع', 'بأسرع وقت', 'باقرب وقت',
  'وين', 'وين الشحن', 'وين التجديد', 'ليش ما', 'ليش ما شحن',
  'لحد الآن', 'لحد الان', 'لحد الآن ما', 'لحد الان ما', 'لسه', 'لسه ما',
  'ما تم', 'ما تم الشحن', 'ما تم التجديد', 'لم يتم', 'لم يتم الشحن',
  'كم مرة', 'كم مرة بطلب', 'من زمان', 'من وقت طويل',
  'وينكم', 'وين ردكم', 'ما في رد', 'ما رديتوا', 'ما جاوبتوا',
  'استعجال', 'عاجل جدا', 'مستعجل جدا', 'ضروري', 'مهم جدا',
  'urgent', 'asap', 'quickly', 'where is', 'still waiting',
];

export function isInternetProblem(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of INTERNET_PROBLEM_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

export function isRechargeRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of RECHARGE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

export function isUrgencyMessage(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of URGENCY_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

function getTemplates(settings?: AutoReplyTemplates | null): AutoReplyTemplates {
  return settings ?? DEFAULT_AUTO_REPLY_TEMPLATES;
}

export function buildWelcomeMessage(customerName: string, daysRemaining: number, templates?: AutoReplyTemplates | null): string {
  return fillTemplate(getTemplates(templates).welcome, { name: customerName || 'زبوننا العزيز', days: daysRemaining });
}

export function buildRechargeReceivedMessage(simNumber: string, templates?: AutoReplyTemplates | null): string {
  return fillTemplate(getTemplates(templates).rechargeRequestReceived, { sim: simNumber });
}

export function buildSupportAcknowledgement(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).supportAcknowledgement;
}

export function buildSupportForwardMessage(simNumber: string, templates?: AutoReplyTemplates | null): string {
  return fillTemplate(getTemplates(templates).supportForwardMessage, { sim: simNumber });
}

export function buildRechargeConfirmedMessage(simNumber: string, templates?: AutoReplyTemplates | null): string {
  return fillTemplate(getTemplates(templates).rechargeConfirmed, { sim: simNumber });
}

export function buildUrgencyMessage(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).urgencyDetected;
}

export function buildEsimAskPhoneModel(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).esimAskPhoneModel;
}

export function buildEsimNotSupported(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).esimNotSupported;
}

export function buildEsimSupportedAskCompany(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).esimSupportedAskCompany;
}

export function buildEsimCompanyList(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).esimCompanyList;
}

export function buildEsimAskDuration(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).esimAskDuration;
}

export function buildEsimTransferToStaff(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).esimTransferToStaff;
}

export function buildRechargeAccepted(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).rechargeAccepted;
}

export function buildSpecifyDuration(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).specifyDuration;
}

export function openWhatsApp(supportPhone: string, message: string): string {
  const cleanPhone = supportPhone.replace(/[^0-9]/g, '');
  const encoded = encodeURIComponent(message);
  // Native protocol opens directly into WhatsApp conversation — no browser redirect
  return `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;
}

export function normalizePhone(phone: string): string {
  let p = phone.replace(/[^0-9]/g, '');
  if (p.startsWith('970')) return '0' + p.substring(3);
  if (p.startsWith('972')) return '0' + p.substring(3);
  return p;
}

export type ClassificationAction = 'greeting' | 'welcome' | 'recharge_request' | 'recharge_forward' | 'recharge_active' | 'support_forward' | 'urgency' | 'keyword_reply' | 'transfer_numbers' | 'specify_duration' | 'esim_request' | 'esim_ask_phone_model' | 'esim_not_supported' | 'esim_ask_company' | 'esim_ask_bundle' | 'esim_bundle_list' | 'esim_transfer_to_staff' | 'esim_company_list' | 'update_request' | 'update_ask_number' | 'update_not_working' | 'problem_ask_details' | 'problem_no_signal' | 'problem_weak_internet' | 'default';

export interface ClassificationResult {
  action: ClassificationAction;
  replyToCustomer: string | null;
  supportPhone: string | null;
  supportMessage: string | null;
  simNumber: string | null;
  daysRemaining: number | null;
  customerName: string | null;
  saleId: string | null;
  chargeDuration: string | null;
  companyName: string | null;
}

// Transfer numbers request keywords — customer asking for bank/transfer account numbers
const TRANSFER_NUMBERS_KEYWORDS = [
  'رقم تحويل', 'ارقام تحويل', 'أرقام تحويل', 'رقم التحويل', 'أرقام التحويل',
  'ابغى رقم تحويل', 'بدي رقم تحويل', 'اريد رقم تحويل', 'رقم تحويل من فضلك',
  'رقم حساب', 'ارقام حساب', 'أرقام حساب', 'رقم الحساب', 'أرقام الحساب',
  'ابغى رقم حساب', 'بدي رقم حساب', 'اريد رقم حساب', 'رقم حسابك',
  'رقم البنك', 'ارقام البنك', 'أرقام البنك', 'ابغى رقم البنك', 'بدي رقم البنك',
  'حوالة', 'حواله', 'ابغى حوالة', 'بدي حوالة', 'اريد حوالة',
  'تحويل', 'ابغى تحويل', 'بدي تحويل', 'اريد تحويل',
  'ادفع', 'ادفع لكم', 'كيف ادفع', 'كيف تحويل', 'طريقة الدفع', 'طريقة تحويل',
  'payment', 'transfer', 'bank account', 'pay',
];

export function isTransferNumbersRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of TRANSFER_NUMBERS_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

export function matchKeywordReply(message: string, keywordReplies: KeywordReply[]): KeywordReply | null {
  const lower = message.toLowerCase().trim();
  for (const kr of keywordReplies) {
    if (!kr.active) continue;
    for (const kw of kr.keywords) {
      if (lower.includes(kw.toLowerCase().trim())) {
        return kr;
      }
    }
  }
  return null;
}

export function classifyIncomingMessage(
  message: string,
  senderPhone: string,
  sales: TelecomSale[],
  companies: TelecomCompany[],
  templates?: AutoReplyTemplates | null,
  keywordReplies?: KeywordReply[] | null,
  bundles?: Bundle[] | null,
  storeName?: string,
  agentBundles?: AgentBundle[] | null,
  senderName?: string,
): ClassificationResult {
  let match = findCustomerByPhone(sales, senderPhone, senderName);
  if (!match) {
    const serialMatch = findCustomerBySerial(sales, message);
    if (serialMatch) {
      match = serialMatch;
    }
  }
  const tpl = getTemplates(templates);
  const transferMsg = tpl.transferNumbersMessage?.trim();

  // Check transfer numbers request early (applies to both known and unknown customers)
  if (transferMsg && isTransferNumbersRequest(message)) {
    clearRechargeConversation(senderPhone);
    return { action: 'transfer_numbers', replyToCustomer: transferMsg, supportPhone: null, supportMessage: null, simNumber: match?.sale.simNumber ?? null, daysRemaining: match?.daysRemaining ?? null, customerName: match?.sale.customerName ?? null, saleId: match?.sale.id ?? null, chargeDuration: null, companyName: null };
  }

  // Check update request early — applies to all customers (known and unknown)
  if (isUpdateRequest(message)) {
    clearRechargeConversation(senderPhone);
    const { primarySimNumber: updateSim } = extractSimNumbersFromMessage(message);
    if (updateSim) {
      setUpdateConversationState(senderPhone, {
        simNumber: updateSim,
        customerName: match?.sale.customerName ?? '',
        saleId: match?.sale.id ?? '',
        companyName: match ? (enrichWithCompany(match, companies)?.company?.name ?? null) : null,
        startedAt: Date.now(),
        updateDoneAt: null,
        problemAskedAt: null,
      });
      return {
        action: 'update_request',
        replyToCustomer: buildUpdateDone(templates),
        supportPhone: '0599991274',
        supportMessage: updateSim,
        simNumber: updateSim,
        daysRemaining: match?.daysRemaining ?? null,
        customerName: match?.sale.customerName ?? null,
        saleId: match?.sale.id ?? null,
        chargeDuration: null,
        companyName: match ? (enrichWithCompany(match, companies)?.company?.name ?? null) : null,
      };
    }
    // No sim number in message — ask for it
    return {
      action: 'update_ask_number',
      replyToCustomer: buildUpdateAskNumber(templates),
      supportPhone: null,
      supportMessage: null,
      simNumber: null,
      daysRemaining: match?.daysRemaining ?? null,
      customerName: match?.sale.customerName ?? null,
      saleId: match?.sale.id ?? null,
      chargeDuration: null,
      companyName: null,
    };
  }

  // Check if there's an active update conversation for this phone
  const updateState = getUpdateConversationState(senderPhone);
  if (updateState) {
    // Customer reports number not working after update (within 2 hours)
    if (isUpdateNotWorking(message)) {
      // Ask customer to specify the problem type before taking action
      setUpdateConversationState(senderPhone, {
        ...updateState,
        problemAskedAt: Date.now(),
      });
      return {
        action: 'problem_ask_details',
        replyToCustomer: buildProblemAskDetails(templates),
        supportPhone: null,
        supportMessage: null,
        simNumber: updateState.simNumber,
        daysRemaining: match?.daysRemaining ?? null,
        customerName: (updateState.customerName || match?.sale.customerName) ?? null,
        saleId: (updateState.saleId || match?.sale.id) ?? null,
        chargeDuration: null,
        companyName: updateState.companyName,
      };
    }
    // Customer is answering the problem-type question
    if (updateState.problemAskedAt) {
      if (isProblemNoSignal(message)) {
        // No signal / no sending → execute update procedure
        clearUpdateConversationState(senderPhone);
        return {
          action: 'problem_no_signal',
          replyToCustomer: buildProblemNoSignal(templates),
          supportPhone: '0599991274',
          supportMessage: updateState.simNumber,
          simNumber: updateState.simNumber,
          daysRemaining: match?.daysRemaining ?? null,
          customerName: (updateState.customerName || match?.sale.customerName) ?? null,
          saleId: (updateState.saleId || match?.sale.id) ?? null,
          chargeDuration: null,
          companyName: updateState.companyName,
        };
      }
      if (isProblemWeakInternet(message)) {
        // Weak internet → send explanation + execute update
        clearUpdateConversationState(senderPhone);
        return {
          action: 'problem_weak_internet',
          replyToCustomer: buildProblemWeakInternet(templates),
          supportPhone: '0599991274',
          supportMessage: updateState.simNumber,
          simNumber: updateState.simNumber,
          daysRemaining: match?.daysRemaining ?? null,
          customerName: (updateState.customerName || match?.sale.customerName) ?? null,
          saleId: (updateState.saleId || match?.sale.id) ?? null,
          chargeDuration: null,
          companyName: updateState.companyName,
        };
      }
      // Answer not recognized → fall through to unrecognized handling (self-learning)
      clearUpdateConversationState(senderPhone);
      // Fall through to normal classification
    }
    // Customer sends a sim number in response to update_ask_number
    const { primarySimNumber: updateSim } = extractSimNumbersFromMessage(message);
    if (updateSim && !isRechargeRequest(message) && !isUrgencyMessage(message)) {
      setUpdateConversationState(senderPhone, {
        ...updateState,
        simNumber: updateSim,
        startedAt: Date.now(),
        problemAskedAt: null,
      });
      return {
        action: 'update_request',
        replyToCustomer: buildUpdateDone(templates),
        supportPhone: '0599991274',
        supportMessage: updateSim,
        simNumber: updateSim,
        daysRemaining: match?.daysRemaining ?? null,
        customerName: (updateState.customerName || match?.sale.customerName) ?? null,
        saleId: (updateState.saleId || match?.sale.id) ?? null,
        chargeDuration: null,
        companyName: updateState.companyName,
      };
    }
    clearUpdateConversationState(senderPhone);
    // Fall through to normal classification
  }

  // Check eSIM request early — applies to all customers (known and unknown)
  if (isEsimRequest(message)) {
    clearRechargeConversation(senderPhone);
    return classifyEsimRequest(message, senderPhone, companies, bundles ?? null, templates ?? null, agentBundles ?? null);
  }
  // Check if there's an active eSIM conversation for this phone
  const esimState = getEsimConversationState(senderPhone);
  if (esimState) {
    const esimResult = classifyEsimFollowup(message, senderPhone, esimState, companies, bundles ?? null, templates ?? null, agentBundles ?? null);
    if (esimResult) return esimResult;
  }

  // Check if there's an active recharge duration conversation for this phone
  const rechargeState = getRechargeConversationState(senderPhone);
  if (rechargeState) {
    const duration = detectChargeDuration(message);
    if (duration) {
      clearRechargeConversation(senderPhone);
      const enriched = match ? enrichWithCompany(match, companies) : null;
      return {
        action: 'recharge_request',
        replyToCustomer: buildRechargeAccepted(templates),
        supportPhone: enriched?.company?.supportPhone ?? null,
        supportMessage: null,
        simNumber: rechargeState.simNumber,
        daysRemaining: match?.daysRemaining ?? null,
        customerName: match?.sale.customerName ?? null,
        saleId: match?.sale.id ?? null,
        chargeDuration: duration,
        companyName: rechargeState.companyName ?? enriched?.company?.name ?? null,
      };
    }
    // Customer sent something but no duration detected — ask again
    return {
      action: 'specify_duration',
      replyToCustomer: buildSpecifyDuration(templates),
      supportPhone: null, supportMessage: null,
      simNumber: rechargeState.simNumber,
      daysRemaining: match?.daysRemaining ?? null,
      customerName: match?.sale.customerName ?? null,
      saleId: match?.sale.id ?? null,
      chargeDuration: null,
      companyName: rechargeState.companyName ?? null,
    };
  }

  if (!match) {
    // Check keyword replies even for unknown customers
    if (keywordReplies && keywordReplies.length > 0) {
      const kr = matchKeywordReply(message, keywordReplies);
      if (kr) {
        return { action: 'keyword_reply', replyToCustomer: kr.reply, supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null, customerName: null, saleId: null, chargeDuration: null, companyName: null };
      }
    }
    // Greeting for first-time / unknown customers — always auto-reply
    return { action: 'greeting', replyToCustomer: fillTemplate(getTemplates(templates).greeting, { storeName: storeName || 'متجرنا' }), supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null, customerName: null, saleId: null, chargeDuration: null, companyName: null };
  }

  const enriched = enrichWithCompany(match, companies);
  const simNumber = match.sale.simNumber;
  const customerName = match.sale.customerName;
  const supportPhone = enriched.company?.supportPhone ?? null;
  const saleId = match.sale.id;

  // Priority 1: Internet problem → immediate support forward
  if (isInternetProblem(message)) {
    return {
      action: 'support_forward',
      replyToCustomer: buildSupportAcknowledgement(templates),
      supportPhone,
      supportMessage: supportPhone ? buildSupportForwardMessage(simNumber, templates) : null,
      simNumber,
      daysRemaining: match.daysRemaining,
      customerName,
      saleId,
      chargeDuration: null,
      companyName: enriched.company?.name ?? null,
    };
  }

  // Check if there's an active recharge-insist conversation for this phone
  const activeState = getRechargeActiveState(senderPhone);
  if (activeState) {
    if (isRechargeInsist(message)) {
      clearRechargeActiveState(senderPhone);
      return {
        action: 'recharge_request',
        replyToCustomer: buildRechargeInsistAccepted(templates),
        supportPhone: null,
        supportMessage: null,
        simNumber: activeState.simNumber,
        daysRemaining: activeState.daysRemaining,
        customerName: activeState.customerName,
        saleId: activeState.saleId,
        chargeDuration: null,
        companyName: activeState.companyName,
      };
    }
    if (isRechargeRequest(message)) {
      // Customer re-sent recharge request — remind again
      clearRechargeActiveState(senderPhone);
      // Fall through to normal recharge handling below
    } else {
      clearRechargeActiveState(senderPhone);
      // Fall through to normal classification
    }
  }

  // Priority 2: Recharge request
  if (isRechargeRequest(message)) {
    // Active subscription with >3 days remaining → inform customer and create support ticket
    if (match.hasActiveCharge && match.daysRemaining > 3) {
      setRechargeActiveState(senderPhone, {
        simNumber,
        customerName: customerName ?? '',
        daysRemaining: match.daysRemaining,
        saleId: saleId ?? '',
        companyName: enriched.company?.name ?? null,
        startedAt: Date.now(),
      });
      return {
        action: 'recharge_active',
        replyToCustomer: buildRechargeActiveReminder(customerName ?? 'زبوننا العزيز', match.daysRemaining, templates),
        supportPhone: null,
        supportMessage: null,
        simNumber,
        daysRemaining: match.daysRemaining,
        customerName,
        saleId,
        chargeDuration: null,
        companyName: enriched.company?.name ?? null,
      };
    }
    // Active subscription with ≤3 days remaining → create pending operation (not forward to support)
    // Fall through to normal recharge_request handling below
    // No active subscription or no support phone → create pending operation for manual handling
    // For companies that require duration, ask for it first
    if (COMPANIES_REQUIRING_DURATION.some((c) => (enriched.company?.name ?? '').includes(c))) {
      setRechargeConversationState(senderPhone, { simNumber, companyName: enriched.company?.name ?? null, startedAt: Date.now() });
      return {
        action: 'specify_duration',
        replyToCustomer: buildSpecifyDuration(templates),
        supportPhone: null,
        supportMessage: null,
        simNumber,
        daysRemaining: match.daysRemaining,
        customerName,
        saleId,
        chargeDuration: null,
        companyName: enriched.company?.name ?? null,
      };
    }
    return {
      action: 'recharge_request',
      replyToCustomer: buildRechargeReceivedMessage(simNumber, templates),
      supportPhone: null,
      supportMessage: null,
      simNumber,
      daysRemaining: match.daysRemaining,
      customerName,
      saleId,
      chargeDuration: null,
      companyName: enriched.company?.name ?? null,
    };
  }

  // Priority 3: Urgency message → immediate support forward
  if (isUrgencyMessage(message)) {
    return {
      action: 'urgency',
      replyToCustomer: buildUrgencyMessage(templates),
      supportPhone,
      supportMessage: supportPhone ? buildSupportForwardMessage(simNumber, templates) : null,
      simNumber,
      daysRemaining: match.daysRemaining,
      customerName,
      saleId,
      chargeDuration: null,
      companyName: enriched.company?.name ?? null,
    };
  }

  // Priority 4: Known customer with active charge → welcome
  if (match.hasActiveCharge && match.daysRemaining >= 3) {
    return {
      action: 'welcome',
      replyToCustomer: buildWelcomeMessage(customerName, match.daysRemaining, templates),
      supportPhone: null,
      supportMessage: null,
      simNumber,
      daysRemaining: match.daysRemaining,
      customerName,
      saleId,
      chargeDuration: null,
      companyName: enriched.company?.name ?? null,
    };
  }

  // Priority 5: Keyword replies (user-taught auto-replies)
  if (keywordReplies && keywordReplies.length > 0) {
    const kr = matchKeywordReply(message, keywordReplies);
    if (kr) {
      return {
        action: 'keyword_reply',
        replyToCustomer: kr.reply,
        supportPhone: null,
        supportMessage: null,
        simNumber,
        daysRemaining: match.daysRemaining,
        customerName,
        saleId,
        chargeDuration: null,
        companyName: enriched.company?.name ?? null,
      };
    }
  }

  return {
    action: 'default',
    replyToCustomer: null,
    supportPhone: null,
    supportMessage: null,
    simNumber,
    daysRemaining: match.daysRemaining,
    customerName,
    saleId,
    chargeDuration: null,
    companyName: enriched.company?.name ?? null,
  };
}

export function classifyRechargeWithDuration(
  message: string,
  senderPhone: string,
  sales: TelecomSale[],
  companies: TelecomCompany[],
  templates?: AutoReplyTemplates | null,
): ClassificationResult {
  const duration = detectChargeDuration(message);
  const { primarySimNumber } = extractSimNumbersFromMessage(message);
  const simNumber = primarySimNumber ?? null;

  const match = findCustomerByPhone(sales, senderPhone);
  const enriched = match ? enrichWithCompany(match, companies) : null;
  const companyFromSale = enriched?.company ?? null;
  const companyFromSim = simNumber ? findCompanyBySimNumber(simNumber, sales, companies) : null;
  const companyName = companyFromSale?.name ?? companyFromSim?.companyName ?? null;

  if (duration) {
    return {
      action: 'recharge_request',
      replyToCustomer: buildRechargeAccepted(templates),
      supportPhone: companyFromSale?.supportPhone ?? null,
      supportMessage: null,
      simNumber,
      daysRemaining: match?.daysRemaining ?? null,
      customerName: match?.sale.customerName ?? null,
      saleId: match?.sale.id ?? null,
      chargeDuration: duration,
      companyName,
    };
  }

  if (!companyName) {
    setRechargeConversationState(senderPhone, { simNumber: simNumber ?? '', companyName: null, startedAt: Date.now() });
    return {
      action: 'specify_duration',
      replyToCustomer: buildSpecifyDuration(templates),
      supportPhone: null,
      supportMessage: null,
      simNumber,
      daysRemaining: null,
      customerName: null,
      saleId: null,
      chargeDuration: null,
      companyName: null,
    };
  }

  if (COMPANIES_REQUIRING_DURATION.some((c) => companyName.includes(c))) {
    setRechargeConversationState(senderPhone, { simNumber: simNumber ?? '', companyName, startedAt: Date.now() });
    return {
      action: 'specify_duration',
      replyToCustomer: buildSpecifyDuration(templates),
      supportPhone: null,
      supportMessage: null,
      simNumber,
      daysRemaining: match?.daysRemaining ?? null,
      customerName: match?.sale.customerName ?? null,
      saleId: match?.sale.id ?? null,
      chargeDuration: null,
      companyName,
    };
  }

  return {
    action: 'recharge_request',
    replyToCustomer: buildRechargeAccepted(templates),
    supportPhone: companyFromSale?.supportPhone ?? null,
    supportMessage: null,
    simNumber,
    daysRemaining: match?.daysRemaining ?? null,
    customerName: match?.sale.customerName ?? null,
    saleId: match?.sale.id ?? null,
    chargeDuration: 'month',
    companyName,
  };
}

function buildRechargeActiveReminder(customerName: string, daysRemaining: number, templates?: AutoReplyTemplates | null): string {
  return fillTemplate(getTemplates(templates).rechargeActiveReminder, { name: customerName || 'زبوننا العزيز', days: daysRemaining });
}

function buildRechargeInsistAccepted(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).rechargeInsistAccepted;
}

// Customer insists on renewing despite having days remaining
const RECHARGE_INSIST_KEYWORDS = [
  'جدد', 'ماشي جدد', 'مش مشكله جدد', 'مش مشكلة جدد', 'ماشي جدد', 'لا مشكله جدد',
  'لا مشكلة جدد', 'جدد رغم', 'جدد مع ذلك', 'جدد عادي', 'جدد عادى',
  'اوكي جدد', 'اوكية جدد', 'تمام جدد', 'خلاص جدد', 'حلو جدد',
  'بدي جدد', 'اريد جدد', 'اشحن رغم', 'شحن رغم', 'جدد لي', 'جدد الان',
  'جدد الآن', 'جدد من فضلك', 'جدد لو سمحت', 'جدد بسرعة', 'جدد بس',
  'نعم جدد', 'اي جدد', 'أي جدد', 'جدد فقط', 'جدد مهما كان',
];

function isRechargeInsist(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of RECHARGE_INSIST_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

// ============ Recharge Active Conversation State ============
export interface RechargeActiveState {
  simNumber: string;
  customerName: string;
  daysRemaining: number;
  saleId: string;
  companyName: string | null;
  startedAt: number;
}

const rechargeActiveConversations = new Map<string, RechargeActiveState>();
const RECHARGE_ACTIVE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function getRechargeActiveState(phone: string): RechargeActiveState | null {
  const state = rechargeActiveConversations.get(phone);
  if (!state) return null;
  if (Date.now() - state.startedAt > RECHARGE_ACTIVE_TIMEOUT_MS) {
    rechargeActiveConversations.delete(phone);
    return null;
  }
  return state;
}

export function setRechargeActiveState(phone: string, state: RechargeActiveState) {
  rechargeActiveConversations.set(phone, state);
}

export function clearRechargeActiveState(phone: string) {
  rechargeActiveConversations.delete(phone);
}

// ============ Update / Refresh Number Keywords ============
const UPDATE_NUMBER_KEYWORDS = [
  'تحديث', 'حدّث', 'حدث', 'حدّث الرقم', 'تحديث الرقم', 'حدث الشريحة', 'حدّث الشريحة',
  'تحديث الشريحة', 'بدي تحديث', 'بدي حدّث', 'بدي حدث', 'اريد تحديث', 'اريد حدّث',
  'ابغى تحديث', 'ابغى حدّث', 'مطلوب تحديث', 'تحديث من فضلك', 'حدّث من فضلك',
  'refresh', 'update number', 'update sim',
];

// Customer reporting number still not working after update (Palestinian dialects)
const UPDATE_NOT_WORKING_KEYWORDS = [
  'ما اشتغل', 'ما اشتغلت', 'ما اشتغلش', 'ما اشتغلتش', 'ما اشتغلش', 'ما زبط', 'ما زبطت',
  'ما زبطش', 'ما زبطتش', 'لسه ما اشتغل', 'لسه ما اشتغلت', 'لسه ما زبط', 'لسه ما زبطت',
  'النت ما رجع', 'النت ما رجعت', 'النت ما رجعش', 'النت ما رجعتش', 'لسه النت',
  'ما في نت', 'ما فيش نت', 'لسه ما في نت', 'لسه ما فيش نت',
  'ما عاد', 'ما عادش', 'ما عادت', 'ما عادتش', 'لسه ما عاد', 'لسه ما عادت',
  'ما اشتغل الرقم', 'ما اشتغلت الشريحة', 'ما زبط الرقم', 'ما زبطت الشريحة',
  'لسه ما اشتغل الرقم', 'لسه ما اشتغلت الشريحة',
  'ما رجع النت', 'ما رجعت النت', 'ما رجعش النت', 'ما رجعتش النت',
  'لسه ما رجع النت', 'لسه ما رجعت النت',
  'لا زبط', 'لا زبطت', 'لا اشتغل', 'لا اشتغلت',
  'ما اشتغل لسه', 'ما زبط لسه', 'ما رجع لسه',
  'شلت وما اشتغل', 'شلت وما زبط', 'شلت وما رجع',
  'عملت ريستارت وما اشتغل', 'عملت ريستارت وما زبط',
  'عملت اعادة تشغيل وما اشتغل', 'عملت اعادة تشغيل وما زبط',
  'ما اشتغل بعد التحديث', 'ما زبط بعد التحديث', 'ما رجع بعد التحديث',
  'not working', 'still not working', 'no internet', 'still no internet',
];

export function isUpdateRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of UPDATE_NUMBER_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

export function isUpdateNotWorking(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of UPDATE_NOT_WORKING_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

// ============ Problem Classification (after customer reports issue) ============
// Keywords indicating "no signal / no sending" (ارسال / اشارة)
const PROBLEM_NO_SIGNAL_KEYWORDS = [
  'ارسال', 'الارسال', 'الارسال نهائيا', 'اختفت الارسال', 'اختاف الارسال',
  'ما في ارسال', 'ما فيش ارسال', 'اختفت الاشاره', 'اختافت الاشاره',
  'الاشاره', 'اشارة', 'اشاره', 'اختفت اشارة', 'اختافت اشارة',
  'ما في اشارة', 'ما فيش اشارة', 'ما في اشاره', 'ما فيش اشاره',
  'اختفت النت', 'اختافت النت', 'ما في نت نهائيا', 'ما فيش نت نهائيا',
  'لا اشارة', 'لا اشاره', 'لا ارسال', 'no signal', 'no sending',
  '1', '١',
];

// Keywords indicating "weak internet" (ضعف الانترنت)
const PROBLEM_WEAK_INTERNET_KEYWORDS = [
  'ضعف', 'ضعيف', 'النت ضعيف', 'النت ضعيف', 'نت ضعيف', 'النت ضعيف',
  'النت سيء', 'نت سيء', 'سيء', 'سيئ', 'بطيء', 'بطئ', 'بطيئ',
  'نت جوال احسن', 'نت جوال احسن منه', 'نت جوال أفضل',
  'اوريدوا احسن', 'اوريدو احسن', 'اوريدوا افضل', 'اوريدو افضل',
  'نت الشارع احسن', 'شارع احسن', 'نت الشارع افضل',
  'كان كويس قبل', 'كان كويس والات', 'كان كويس والان', 'كان كويس والآن',
  'كان تمام والات', 'كان تمام والان', 'كان تمام والآن',
  'بفتحش', 'بفتحش حاجه', 'بفتحش حاجة', 'ما بفتح', 'ما بفتحش',
  'بطيء جدا', 'بطئ جدا', 'بطيئ جدا', 'very slow', 'weak internet',
  '3', '٣',
];

export function isProblemNoSignal(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of PROBLEM_NO_SIGNAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

export function isProblemWeakInternet(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of PROBLEM_WEAK_INTERNET_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

// ============ Update Conversation State ============
export interface UpdateConversationState {
  simNumber: string;
  customerName: string;
  saleId: string;
  companyName: string | null;
  startedAt: number;
  updateDoneAt: number | null;
  problemAskedAt: number | null;
}

const updateConversations = new Map<string, UpdateConversationState>();
const UPDATE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export function getUpdateConversationState(phone: string): UpdateConversationState | null {
  const state = updateConversations.get(phone);
  if (!state) return null;
  if (Date.now() - state.startedAt > UPDATE_TIMEOUT_MS) {
    updateConversations.delete(phone);
    return null;
  }
  return state;
}

export function setUpdateConversationState(phone: string, state: UpdateConversationState) {
  updateConversations.set(phone, state);
}

export function clearUpdateConversationState(phone: string) {
  updateConversations.delete(phone);
}

function buildUpdateAskNumber(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).updateRequestAskNumber;
}

function buildUpdateDone(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).updateRequestDone;
}

function buildUpdateNotWorkingForwarded(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).updateNotWorkingForwarded;
}

function buildProblemAskDetails(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).problemAskDetails;
}

function buildProblemNoSignal(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).problemNoSignalUpdate;
}

function buildProblemWeakInternet(templates?: AutoReplyTemplates | null): string {
  return getTemplates(templates).problemWeakInternet;
}

function extractSimNumbersFromMessage(message: string): { primarySimNumber: string | null } {
  const numbers: string[] = [];
  const regexes = [/0\d{9,10}/g, /\+970\d{9,10}/g, /\+972\d{9,10}/g];
  const prefixes = ['050', '052', '053', '054', '055', '056', '058', '059'];
  for (const regex of regexes) {
    const matches = message.match(regex);
    if (matches) {
      for (const m of matches) {
        const normalized = m.replace(/\+970/, '0').replace(/\+972/, '0');
        if (prefixes.some((p) => normalized.startsWith(p))) {
          numbers.push(normalized);
        }
      }
    }
  }
  const unique = [...new Set(numbers)];
  return { primarySimNumber: unique.length > 0 ? unique[unique.length - 1] : null };
}

// ============ Recharge Duration Conversation State ============

export interface RechargeConversationState {
  simNumber: string;
  companyName: string | null;
  startedAt: number;
}

const rechargeConversations = new Map<string, RechargeConversationState>();
const RECHARGE_CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function getRechargeConversationState(phone: string): RechargeConversationState | null {
  const state = rechargeConversations.get(phone);
  if (!state) return null;
  if (Date.now() - state.startedAt > RECHARGE_CONVERSATION_TIMEOUT_MS) {
    rechargeConversations.delete(phone);
    return null;
  }
  return state;
}

export function setRechargeConversationState(phone: string, state: RechargeConversationState) {
  rechargeConversations.set(phone, state);
}

export function clearRechargeConversation(phone: string) {
  rechargeConversations.delete(phone);
}

// ============ eSIM Conversation State ============

export type EsimConversationStep = 'ask_phone_model' | 'check_compatibility' | 'ask_company' | 'ask_bundle' | 'transfer_to_staff' | 'completed';

export interface EsimConversationState {
  step: EsimConversationStep;
  phoneModel: string | null;
  supported: boolean | null;
  companyName: string | null;
  companyId: string | null;
  bundleList: EsimBundleListItem[] | null;
  startedAt: number;
}

const esimConversations = new Map<string, EsimConversationState>();
const ESIM_CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function getEsimConversationState(phone: string): EsimConversationState | null {
  const state = esimConversations.get(phone);
  if (!state) return null;
  if (Date.now() - state.startedAt > ESIM_CONVERSATION_TIMEOUT_MS) {
    esimConversations.delete(phone);
    return null;
  }
  return state;
}

export function setEsimConversationState(phone: string, state: EsimConversationState) {
  esimConversations.set(phone, state);
}

export function clearEsimConversation(phone: string) {
  esimConversations.delete(phone);
}

function matchCompanyName(message: string, companies: TelecomCompany[]): string | null {
  const lower = message.toLowerCase().trim();
  for (const c of companies) {
    if (!c.active) continue;
    if (lower.includes(c.name.toLowerCase().trim())) {
      return c.name;
    }
  }
  const knownCompanies = [
    { name: 'سيلكوم', aliases: ['سيلكوم', 'cellcom', 'selcom'] },
    { name: 'الوها', aliases: ['الوها', 'aloha', 'هوا'] },
    { name: 'ويكم', aliases: ['ويكم', 'we4m', 'we com'] },
    { name: 'بيلفون', aliases: ['بيلفون', 'palphone', 'pelphone'] },
    { name: 'رامي ليفي', aliases: ['رامي ليفي', 'rami levi', 'رامي ليفي'] },
    { name: 'هوت موبايل', aliases: ['هوت موبايل', 'hot mobile', 'هوت'] },
    { name: '019', aliases: ['019', 'صفر واحد تسعة'] },
  ];
  for (const c of knownCompanies) {
    for (const alias of c.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        const matched = companies.find((tc) => tc.name === c.name && tc.active);
        return matched ? matched.name : c.name;
      }
    }
  }
  return null;
}

function classifyEsimRequest(
  message: string,
  senderPhone: string,
  companies: TelecomCompany[],
  bundles: Bundle[] | null,
  templates?: AutoReplyTemplates | null,
  agentBundles?: AgentBundle[] | null,
): ClassificationResult {
  const phoneModel = extractPhoneModel(message);
  const tpl = getTemplates(templates);

  if (phoneModel) {
    const checkResult = checkEsimCompatibility(phoneModel);
    if (checkResult.supported) {
      const state: EsimConversationState = {
        step: 'ask_company', phoneModel, supported: true, companyName: null, companyId: null, bundleList: null, startedAt: Date.now(),
      };
      setEsimConversationState(senderPhone, state);
      return {
        action: 'esim_ask_company', replyToCustomer: tpl.esimSupportedAskCompany,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: null, companyName: null,
      };
    }
    if (checkResult.confidence === 'high' && !checkResult.supported) {
      clearEsimConversation(senderPhone);
      return {
        action: 'esim_not_supported', replyToCustomer: tpl.esimNotSupported,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: null, companyName: null,
      };
    }
  }

  const state: EsimConversationState = {
    step: 'ask_phone_model', phoneModel: null, supported: null, companyName: null, companyId: null, bundleList: null, startedAt: Date.now(),
  };
  setEsimConversationState(senderPhone, state);
  return {
    action: 'esim_ask_phone_model', replyToCustomer: tpl.esimAskPhoneModel,
    supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
    customerName: null, saleId: null, chargeDuration: null, companyName: null,
  };
}

export interface EsimBundleListItem {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  companyName: string;
}

function durationDaysToLabel(days: number): string {
  if (days <= 3) return '3 أيام';
  if (days <= 7) return 'أسبوع';
  if (days <= 14) return 'أسبوعين';
  if (days <= 21) return '3 أسابيع';
  if (days <= 30) return 'شهر';
  if (days <= 60) return 'شهرين';
  if (days <= 90) return '3 شهور';
  if (days <= 180) return '6 شهور';
  if (days <= 365) return 'سنة';
  return `${days} يوم`;
}

function mergeBundlesWithAgentOffers(
  bundles: Bundle[],
  agentBundles: AgentBundle[] | null,
  companyId: string | null,
  companyName: string,
): EsimBundleListItem[] {
  const items: EsimBundleListItem[] = bundles.map((b) => ({
    id: b.id, name: b.name, price: b.price, durationDays: b.durationDays, companyName: b.companyName,
  }));
  if (agentBundles && agentBundles.length > 0) {
    for (const ab of agentBundles) {
      if (!ab.active) continue;
      if (companyId && ab.companyId !== companyId) continue;
      if (!companyId && ab.companyName !== companyName) continue;
      const isOffer = ab.bundleType === 'offer' || (ab.prices?.['3_months'] != null && ab.prices?.['month'] == null);
      if (isOffer && ab.prices?.['3_months'] != null) {
        items.push({
          id: ab.id, name: ab.bundleName, price: ab.prices['3_months'], durationDays: 90, companyName: ab.companyName,
        });
      } else if (!isOffer && ab.prices?.['month'] != null) {
        items.push({
          id: ab.id, name: ab.bundleName, price: ab.prices['month'], durationDays: 30, companyName: ab.companyName,
        });
      }
    }
  }
  return items.sort((a, b) => a.price - b.price);
}

function buildBundleListMessage(companyName: string, items: EsimBundleListItem[]): string {
  const lines: string[] = [`باقات ${companyName} المتوفرة:`];
  items.forEach((b, i) => {
    const durationLabel = durationDaysToLabel(b.durationDays);
    const isOffer = b.durationDays > 30;
    const prefix = isOffer ? 'عرض خاص: ' : '';
    lines.push(`${i + 1}. ${prefix}${b.name} - ${durationLabel} - ${b.price} شيكل`);
  });
  lines.push('يرجى الرد برقم الباقة التي تريدها');
  return lines.join('\n');
}

function classifyEsimFollowup(
  message: string,
  senderPhone: string,
  state: EsimConversationState,
  companies: TelecomCompany[],
  bundles: Bundle[] | null,
  templates?: AutoReplyTemplates | null,
  agentBundles?: AgentBundle[] | null,
): ClassificationResult | null {
  const tpl = getTemplates(templates);
  if (state.step === 'ask_phone_model') {
    const phoneModel = extractPhoneModel(message);
    if (!phoneModel) {
      return {
        action: 'esim_ask_phone_model', replyToCustomer: tpl.esimAskPhoneModel,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: null, companyName: null,
      };
    }
    const checkResult = checkEsimCompatibility(phoneModel);
    if (checkResult.supported) {
      setEsimConversationState(senderPhone, { ...state, step: 'ask_company', phoneModel, supported: true });
      return {
        action: 'esim_ask_company', replyToCustomer: tpl.esimSupportedAskCompany,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: null, companyName: null,
      };
    }
    if (checkResult.confidence === 'high' && !checkResult.supported) {
      clearEsimConversation(senderPhone);
      return {
        action: 'esim_not_supported', replyToCustomer: tpl.esimNotSupported,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: null, companyName: null,
      };
    }
    return {
      action: 'esim_ask_phone_model', replyToCustomer: tpl.esimAskPhoneModel,
      supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
      customerName: null, saleId: null, chargeDuration: null, companyName: null,
    };
  }

  if (state.step === 'ask_company') {
    if (isAdviceRequest(message)) {
      setEsimConversationState(senderPhone, { ...state, step: 'transfer_to_staff' });
      return {
        action: 'esim_transfer_to_staff', replyToCustomer: tpl.esimTransferToStaff,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: null, companyName: null,
      };
    }
    const companyName = matchCompanyName(message, companies);
    if (companyName) {
      const company = companies.find((c) => c.name === companyName && c.active);
      const companyId = company?.id ?? null;
      const companyBundles = (bundles ?? []).filter(
        (b) => b.active && (b.companyId === companyId || b.companyName === companyName),
      );
      const mergedItems = mergeBundlesWithAgentOffers(companyBundles, agentBundles ?? null, companyId, companyName);

      if (mergedItems.length === 0) {
        setEsimConversationState(senderPhone, { ...state, step: 'ask_bundle', companyName, companyId, bundleList: [] });
        return {
          action: 'esim_ask_bundle', replyToCustomer: tpl.esimAskDuration,
          supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
          customerName: null, saleId: null, chargeDuration: null, companyName,
        };
      }

      const bundleListMsg = buildBundleListMessage(companyName, mergedItems);
      setEsimConversationState(senderPhone, { ...state, step: 'ask_bundle', companyName, companyId, bundleList: mergedItems });
      return {
        action: 'esim_ask_bundle', replyToCustomer: bundleListMsg,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: null, companyName,
      };
    }
    return {
      action: 'esim_company_list', replyToCustomer: tpl.esimCompanyList,
      supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
      customerName: null, saleId: null, chargeDuration: null, companyName: null,
    };
  }

  if (state.step === 'ask_bundle') {
    if (state.bundleList && state.bundleList.length > 0) {
      const num = parseInt(message.trim(), 10);
      if (!isNaN(num) && num >= 1 && num <= state.bundleList.length) {
        const selected = state.bundleList[num - 1];
        const durationLabel = durationDaysToLabel(selected.durationDays);
        clearEsimConversation(senderPhone);
        return {
          action: 'recharge_request', replyToCustomer: tpl.rechargeAccepted,
          supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
          customerName: null, saleId: null,
          chargeDuration: durationLabel,
          companyName: state.companyName,
        };
      }
      const lower = message.toLowerCase().trim();
      const byName = state.bundleList.find((b) => lower.includes(b.name.toLowerCase()));
      if (byName) {
        const durationLabel = durationDaysToLabel(byName.durationDays);
        clearEsimConversation(senderPhone);
        return {
          action: 'recharge_request', replyToCustomer: tpl.rechargeAccepted,
          supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
          customerName: null, saleId: null,
          chargeDuration: durationLabel,
          companyName: state.companyName,
        };
      }
      const bundleListMsg = buildBundleListMessage(state.companyName ?? '', state.bundleList);
      return {
        action: 'esim_bundle_list', replyToCustomer: bundleListMsg,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: null, companyName: state.companyName,
      };
    }
    const duration = detectChargeDuration(message);
    if (duration) {
      clearEsimConversation(senderPhone);
      return {
        action: 'recharge_request', replyToCustomer: tpl.rechargeAccepted,
        supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
        customerName: null, saleId: null, chargeDuration: duration, companyName: state.companyName,
      };
    }
    return {
      action: 'esim_ask_bundle', replyToCustomer: tpl.esimAskDuration,
      supportPhone: null, supportMessage: null, simNumber: null, daysRemaining: null,
      customerName: null, saleId: null, chargeDuration: null, companyName: state.companyName,
    };
  }

  if (state.step === 'transfer_to_staff') {
    clearEsimConversation(senderPhone);
    return null;
  }

  return null;
}
