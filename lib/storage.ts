import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product, Customer, Transaction, Settings, AuditEntry, Supplier, Expense, Shift, DraftBill, Currency, Staff, Promotion, Stocktake, Attachment, LicenseInfo, TelecomCompany, SimCard, Bundle, SubAgent, DebtReminderSchedule, TelecomSale, AgentBundle, SimLocation, SimLocationStock, TelecomSupplier, Shipment, RechargeRequest, BusinessHoursConfig, KeywordReply, PendingOperation, FreezeRequest, SupportTicket, UnrecognizedMessage, TransferNotification, TransferReport, NameMapping, SmsMessage, QuickReplyTemplate, ScheduledSms } from '@/types';
import type { CustomerFile } from './customer-files';
import { DEFAULT_SMS_TEMPLATE, DEFAULT_CURRENCIES, DEFAULT_TELECOM_COMPANIES, DEFAULT_TELECOM_BUNDLES, DEFAULT_AUTO_REPLY_TEMPLATES } from '@/types';
import { createDefaultSchedule } from './business-hours';

const KEYS = {
  PRODUCTS: 'sahab_products',
  CUSTOMERS: 'sahab_customers',
  TRANSACTIONS: 'sahab_transactions',
  SETTINGS: 'sahab_settings',
  BACKUP: 'sahab_backup',
  AUDIT: 'sahab_audit',
  SUPPLIERS: 'sahab_suppliers',
  EXPENSES: 'sahab_expenses',
  SHIFTS: 'sahab_shifts',
  DRAFTS: 'sahab_drafts',
  CURRENCIES: 'sahab_currencies',
  STAFF: 'sahab_staff',
  PROMOTIONS: 'sahab_promotions',
  STOCKTAKES: 'sahab_stocktakes',
  ATTACHMENTS: 'sahab_attachments',
  CURRENT_STAFF: 'sahab_current_staff',
  LICENSE: 'sahab_license',
  TELECOM_COMPANIES: 'sahab_telecom_companies',
  SIM_CARDS: 'sahab_sim_cards',
  BUNDLES: 'sahab_bundles',
  SUB_AGENTS: 'sahab_sub_agents',
  DEBT_REMINDERS: 'sahab_debt_reminders',
  TELECOM_SALES: 'sahab_telecom_sales',
  AGENT_BUNDLES: 'sahab_agent_bundles',
  SIM_LOCATIONS: 'sahab_sim_locations',
  SIM_LOCATION_STOCK: 'sahab_sim_location_stock',
  TELECOM_SUPPLIERS: 'sahab_telecom_suppliers',
  SHIPMENTS: 'sahab_shipments',
  RECHARGE_REQUESTS: 'sahab_recharge_requests',
  BUSINESS_HOURS: 'sahab_business_hours',
  KEYWORD_REPLIES: 'sahab_keyword_replies',
  PENDING_OPERATIONS: 'sahab_pending_operations',
  FREEZE_REQUESTS: 'sahab_freeze_requests',
  SUPPORT_TICKETS: 'sahab_support_tickets',
  UNRECOGNIZED_MESSAGES: 'sahab_unrecognized_messages',
  TRANSFER_NOTIFICATIONS: 'sahab_transfer_notifications',
  TRANSFER_REPORTS: 'sahab_transfer_reports',
  NAME_MAPPINGS: 'sahab_name_mappings',
  CUSTOMER_FILES: 'sahab_customer_files',
  SMS_MESSAGES: 'sahab_sms_messages',
  PINNED_CONVERSATIONS: 'sahab_pinned_conversations',
  BLOCKED_NUMBERS: 'sahab_blocked_numbers',
  ARCHIVED_CONVERSATIONS: 'sahab_archived_conversations',
  QUICK_REPLY_TEMPLATES: 'sahab_quick_reply_templates',
  SCHEDULED_MESSAGES: 'sahab_scheduled_messages',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  businessMode: 'retail',
  theme: 'light',
  storeName: 'سحاب POS',
  currency: 'ر.س',
  ownerName: '',
  phone: '',
  enableSms: true,
  enableVipDiscount: true,
  taxRate: 0,
  pinEnabled: false,
  ownerPin: '',
  smsTemplate: DEFAULT_SMS_TEMPLATE,
  enableExpiryAlerts: true,
  expiryAlertDays: 2,
  enableLoyalty: true,
  loyaltyRate: 1,
  enableVoiceSearch: true,
  enableStockPrediction: true,
  enablePeakMode: true,
  enableDraftBills: true,
  enableShiftManagement: true,
  enableExpenses: true,
  enableMultiCurrency: false,
  enableAutoLock: false,
  autoLockMinutes: 3,
  enableQrReceipt: true,
  defaultCurrencyCode: 'SAR',
  supplierPaymentDueDays: 30,
  enableStaffManagement: true,
  enablePromotions: true,
  enableStocktake: true,
  enableAttachments: true,
  enableSmartAlerts: true,
  requireManagerForDiscount: false,
  requireManagerForDelete: true,
  requireManagerForReturn: false,
  globalMaxDiscountPercent: 20,
  trialDays: 7,
  enableLicenseSystem: false,
  enableBusinessHours: false,
  enableAutoResponder: false,
  enableSmsMonitoring: false,
  enableWhatsappMonitoring: false,
  enableTransferDetection: false,
  enableScreenshotDetection: false,
  autoReplyTemplates: DEFAULT_AUTO_REPLY_TEMPLATES,
  autoForwardTimeoutMinutes: 60,
  receiptLogo: '',
  receiptHeaderText: '',
  receiptFooterText: '',
  enableAutoBackup: false,
  enableSmsInbox: false,
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // storage read failed, return fallback
  }
  return fallback;
}

async function save<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage write failed
  }
}

export interface BackupData {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  settings: Settings;
  auditLog: AuditEntry[];
  suppliers: Supplier[];
  expenses: Expense[];
  shifts: Shift[];
  currencies: Currency[];
  staff: Staff[];
  promotions: Promotion[];
  stocktakes: Stocktake[];
  attachments: Attachment[];
  timestamp: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  autoMode: false,
  days: {
    0: { enabled: false, openTime: '09:00', closeTime: '18:00' },
    1: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    2: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    3: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    4: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    5: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    6: { enabled: true, openTime: '09:00', closeTime: '14:00' },
  },
  enableDnd: false,
  enableAutoReply: true,
  enableCallRejection: true,
  closedMessage: 'نعتذر، نحن خارج وقت العمل حالياً. سيتم الرد على رسالتك والاتصال بكم مع بدء الدوام.',
  openMessage: 'تم استلام طلبك وسيتم تنفيذه في أقرب وقت ممكن. شكراً لتواصلكم معنا.',
  autoReplyCooldownMinutes: 60,
};

export const storage = {
  getProducts: (): Promise<Product[]> => load<Product[]>(KEYS.PRODUCTS, []),
  saveProducts: (products: Product[]): Promise<void> => save(KEYS.PRODUCTS, products),

  getCustomers: (): Promise<Customer[]> => load<Customer[]>(KEYS.CUSTOMERS, []),
  saveCustomers: (customers: Customer[]): Promise<void> => save(KEYS.CUSTOMERS, customers),

  getTransactions: (): Promise<Transaction[]> => load<Transaction[]>(KEYS.TRANSACTIONS, []),
  saveTransactions: (txns: Transaction[]): Promise<void> => save(KEYS.TRANSACTIONS, txns),

  getSettings: (): Promise<Settings> => load<Settings>(KEYS.SETTINGS, DEFAULT_SETTINGS),
  saveSettings: (settings: Settings): Promise<void> => save(KEYS.SETTINGS, settings),

  getAuditLog: (): Promise<AuditEntry[]> => load<AuditEntry[]>(KEYS.AUDIT, []),
  saveAuditLog: (log: AuditEntry[]): Promise<void> => save(KEYS.AUDIT, log),

  getSuppliers: (): Promise<Supplier[]> => load<Supplier[]>(KEYS.SUPPLIERS, []),
  saveSuppliers: (suppliers: Supplier[]): Promise<void> => save(KEYS.SUPPLIERS, suppliers),

  getExpenses: (): Promise<Expense[]> => load<Expense[]>(KEYS.EXPENSES, []),
  saveExpenses: (expenses: Expense[]): Promise<void> => save(KEYS.EXPENSES, expenses),

  getShifts: (): Promise<Shift[]> => load<Shift[]>(KEYS.SHIFTS, []),
  saveShifts: (shifts: Shift[]): Promise<void> => save(KEYS.SHIFTS, shifts),

  getDrafts: (): Promise<DraftBill[]> => load<DraftBill[]>(KEYS.DRAFTS, []),
  saveDrafts: (drafts: DraftBill[]): Promise<void> => save(KEYS.DRAFTS, drafts),

  getCurrencies: (): Promise<Currency[]> => load<Currency[]>(KEYS.CURRENCIES, DEFAULT_CURRENCIES),
  saveCurrencies: (currencies: Currency[]): Promise<void> => save(KEYS.CURRENCIES, currencies),

  getStaff: (): Promise<Staff[]> => load<Staff[]>(KEYS.STAFF, []),
  saveStaff: (staff: Staff[]): Promise<void> => save(KEYS.STAFF, staff),

  getPromotions: (): Promise<Promotion[]> => load<Promotion[]>(KEYS.PROMOTIONS, []),
  savePromotions: (promotions: Promotion[]): Promise<void> => save(KEYS.PROMOTIONS, promotions),

  getStocktakes: (): Promise<Stocktake[]> => load<Stocktake[]>(KEYS.STOCKTAKES, []),
  saveStocktakes: (stocktakes: Stocktake[]): Promise<void> => save(KEYS.STOCKTAKES, stocktakes),

  getAttachments: (): Promise<Attachment[]> => load<Attachment[]>(KEYS.ATTACHMENTS, []),
  saveAttachments: (attachments: Attachment[]): Promise<void> => save(KEYS.ATTACHMENTS, attachments),

  getCurrentStaffId: (): Promise<string | null> => load<string | null>(KEYS.CURRENT_STAFF, null),
  saveCurrentStaffId: (id: string | null): Promise<void> => save(KEYS.CURRENT_STAFF, id),

  getLicense: (): Promise<LicenseInfo | null> => load<LicenseInfo | null>(KEYS.LICENSE, null),
  saveLicense: (license: LicenseInfo): Promise<void> => save(KEYS.LICENSE, license),

  getBackup: (): Promise<BackupData | null> => load<BackupData | null>(KEYS.BACKUP, null),
  saveBackup: (data: BackupData): Promise<void> => save(KEYS.BACKUP, data),

  getTelecomCompanies: (): Promise<TelecomCompany[]> => load<TelecomCompany[]>(KEYS.TELECOM_COMPANIES, DEFAULT_TELECOM_COMPANIES.map((c, i) => ({
    ...c, id: `tc_${i}`, createdAt: Date.now(), updatedAt: Date.now(),
  }))),
  saveTelecomCompanies: (companies: TelecomCompany[]): Promise<void> => save(KEYS.TELECOM_COMPANIES, companies),

  getSimCards: (): Promise<SimCard[]> => load<SimCard[]>(KEYS.SIM_CARDS, []),
  saveSimCards: (sims: SimCard[]): Promise<void> => save(KEYS.SIM_CARDS, sims),

  getBundles: (): Promise<Bundle[]> => load<Bundle[]>(KEYS.BUNDLES, DEFAULT_TELECOM_BUNDLES.map((b, i) => ({
    ...b, id: `tb_${i}`, createdAt: Date.now(), updatedAt: Date.now(),
  }))),
  saveBundles: (bundles: Bundle[]): Promise<void> => save(KEYS.BUNDLES, bundles),

  getSubAgents: (): Promise<SubAgent[]> => load<SubAgent[]>(KEYS.SUB_AGENTS, []).then((agents) => agents.map((a) => ({
    ...a,
    scheduleEnabled: a.scheduleEnabled ?? false,
    schedule: a.schedule ?? createDefaultSchedule(),
  }))),
  saveSubAgents: (agents: SubAgent[]): Promise<void> => save(KEYS.SUB_AGENTS, agents),

  getDebtReminders: (): Promise<DebtReminderSchedule[]> => load<DebtReminderSchedule[]>(KEYS.DEBT_REMINDERS, []),
  saveDebtReminders: (reminders: DebtReminderSchedule[]): Promise<void> => save(KEYS.DEBT_REMINDERS, reminders),

  getTelecomSales: (): Promise<TelecomSale[]> => load<TelecomSale[]>(KEYS.TELECOM_SALES, []),
  saveTelecomSales: (sales: TelecomSale[]): Promise<void> => save(KEYS.TELECOM_SALES, sales),

  getAgentBundles: (): Promise<AgentBundle[]> => load<AgentBundle[]>(KEYS.AGENT_BUNDLES, []),
  saveAgentBundles: (ab: AgentBundle[]): Promise<void> => save(KEYS.AGENT_BUNDLES, ab),

  getSimLocations: (): Promise<SimLocation[]> => load<SimLocation[]>(KEYS.SIM_LOCATIONS, []),
  saveSimLocations: (locs: SimLocation[]): Promise<void> => save(KEYS.SIM_LOCATIONS, locs),

  getSimLocationStock: (): Promise<SimLocationStock[]> => load<SimLocationStock[]>(KEYS.SIM_LOCATION_STOCK, []),
  saveSimLocationStock: (stock: SimLocationStock[]): Promise<void> => save(KEYS.SIM_LOCATION_STOCK, stock),

  getTelecomSuppliers: (): Promise<TelecomSupplier[]> => load<TelecomSupplier[]>(KEYS.TELECOM_SUPPLIERS, []),
  saveTelecomSuppliers: (suppliers: TelecomSupplier[]): Promise<void> => save(KEYS.TELECOM_SUPPLIERS, suppliers),

  getShipments: (): Promise<Shipment[]> => load<Shipment[]>(KEYS.SHIPMENTS, []),
  saveShipments: (shipments: Shipment[]): Promise<void> => save(KEYS.SHIPMENTS, shipments),

  getRechargeRequests: (): Promise<RechargeRequest[]> => load<RechargeRequest[]>(KEYS.RECHARGE_REQUESTS, []),
  saveRechargeRequests: (requests: RechargeRequest[]): Promise<void> => save(KEYS.RECHARGE_REQUESTS, requests),

  getBusinessHours: (): Promise<BusinessHoursConfig> => load<BusinessHoursConfig>(KEYS.BUSINESS_HOURS, DEFAULT_BUSINESS_HOURS),
  saveBusinessHours: (config: BusinessHoursConfig): Promise<void> => save(KEYS.BUSINESS_HOURS, config),

  getKeywordReplies: (): Promise<KeywordReply[]> => load<KeywordReply[]>(KEYS.KEYWORD_REPLIES, []),
  saveKeywordReplies: (replies: KeywordReply[]): Promise<void> => save(KEYS.KEYWORD_REPLIES, replies),

  getPendingOperations: (): Promise<PendingOperation[]> => load<PendingOperation[]>(KEYS.PENDING_OPERATIONS, []),
  savePendingOperations: (ops: PendingOperation[]): Promise<void> => save(KEYS.PENDING_OPERATIONS, ops),

  getFreezeRequests: (): Promise<FreezeRequest[]> => load<FreezeRequest[]>(KEYS.FREEZE_REQUESTS, []),
  saveFreezeRequests: (reqs: FreezeRequest[]): Promise<void> => save(KEYS.FREEZE_REQUESTS, reqs),

  getSupportTickets: (): Promise<SupportTicket[]> => load<SupportTicket[]>(KEYS.SUPPORT_TICKETS, []),
  saveSupportTickets: (tickets: SupportTicket[]): Promise<void> => save(KEYS.SUPPORT_TICKETS, tickets),

  getUnrecognizedMessages: (): Promise<UnrecognizedMessage[]> => load<UnrecognizedMessage[]>(KEYS.UNRECOGNIZED_MESSAGES, []),
  saveUnrecognizedMessages: (msgs: UnrecognizedMessage[]): Promise<void> => save(KEYS.UNRECOGNIZED_MESSAGES, msgs),

  getTransferNotifications: (): Promise<TransferNotification[]> => load<TransferNotification[]>(KEYS.TRANSFER_NOTIFICATIONS, []),
  saveTransferNotifications: (tns: TransferNotification[]): Promise<void> => save(KEYS.TRANSFER_NOTIFICATIONS, tns),

  getTransferReports: (): Promise<TransferReport[]> => load<TransferReport[]>(KEYS.TRANSFER_REPORTS, []),
  saveTransferReports: (trs: TransferReport[]): Promise<void> => save(KEYS.TRANSFER_REPORTS, trs),

  getNameMappings: (): Promise<NameMapping[]> => load<NameMapping[]>(KEYS.NAME_MAPPINGS, []),
  saveNameMappings: (nms: NameMapping[]): Promise<void> => save(KEYS.NAME_MAPPINGS, nms),

  getCustomerFiles: (): Promise<CustomerFile[]> => load<CustomerFile[]>(KEYS.CUSTOMER_FILES, []),
  saveCustomerFiles: (files: CustomerFile[]): Promise<void> => save(KEYS.CUSTOMER_FILES, files),

  getSmsMessages: (): Promise<SmsMessage[]> => load<SmsMessage[]>(KEYS.SMS_MESSAGES, []),
  saveSmsMessages: (msgs: SmsMessage[]): Promise<void> => save(KEYS.SMS_MESSAGES, msgs),

  getPinnedConversations: (): Promise<string[]> => load<string[]>(KEYS.PINNED_CONVERSATIONS, []),
  savePinnedConversations: (phones: string[]): Promise<void> => save(KEYS.PINNED_CONVERSATIONS, phones),

  getBlockedNumbers: (): Promise<string[]> => load<string[]>(KEYS.BLOCKED_NUMBERS, []),
  saveBlockedNumbers: (phones: string[]): Promise<void> => save(KEYS.BLOCKED_NUMBERS, phones),

  getArchivedConversations: (): Promise<string[]> => load<string[]>(KEYS.ARCHIVED_CONVERSATIONS, []),
  saveArchivedConversations: (phones: string[]): Promise<void> => save(KEYS.ARCHIVED_CONVERSATIONS, phones),

  getQuickReplyTemplates: (): Promise<QuickReplyTemplate[]> => load<QuickReplyTemplate[]>(KEYS.QUICK_REPLY_TEMPLATES, DEFAULT_QUICK_REPLIES),
  saveQuickReplyTemplates: (templates: QuickReplyTemplate[]): Promise<void> => save(KEYS.QUICK_REPLY_TEMPLATES, templates),

  getScheduledMessages: (): Promise<ScheduledSms[]> => load<ScheduledSms[]>(KEYS.SCHEDULED_MESSAGES, []),
  saveScheduledMessages: (msgs: ScheduledSms[]): Promise<void> => save(KEYS.SCHEDULED_MESSAGES, msgs),

  generateId,
};

const DEFAULT_QUICK_REPLIES: QuickReplyTemplate[] = [
  { id: 'qr_1', label: 'تم استلام الطلب', body: 'تم استلام طلبك وسيتم تنفيذه في أقرب وقت ممكن. شكراً لتواصلكم معنا.', createdAt: 0 },
  { id: 'qr_2', label: 'تم الشحن', body: 'تم شحن الرقم بنجاح، شكراً لصبركم.', createdAt: 0 },
  { id: 'qr_3', label: 'طلب قيد التنفيذ', body: 'طلبك قيد التنفيذ حالياً، سيتم إبلاغك فور اكتماله.', createdAt: 0 },
  { id: 'qr_4', label: 'خارج الدوام', body: 'نعتذر، نحن خارج وقت العمل حالياً. سيتم الرد على رسالتك مع بدء الدوام.', createdAt: 0 },
  { id: 'qr_5', label: 'يرجى إرسال المبلغ', body: 'يرجى تحويل المبلغ المطلوب وسنقوم بتنفيذ طلبك فور تأكيد التحويل.', createdAt: 0 },
  { id: 'qr_6', label: 'شكراً لتعاملكم', body: 'شكراً لتعاملكم معنا، نحن دائماً في خدمتكم.', createdAt: 0 },
];
