import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type {
  Product, Customer, Transaction, Settings, DashboardStats,
  AuditEntry, AuditAction, StockPrediction, Supplier, Expense,
  Shift, DraftBill, Currency, Staff, Promotion, Stocktake, Attachment, SmartAlert,
  LicenseInfo, ActivationResult, LicensePlan,
  TelecomCompany, SimCard, Bundle, SubAgent, DebtReminderSchedule, TelecomSale, SimType, OperationType, PaymentStatus,
  AgentBundle, SimLocation, SimLocationStock, TelecomSupplier, Shipment, RechargeRequest, RechargeRequestStatus,
  BusinessHoursConfig, KeywordReply, PendingOperation, PendingOperationStatus, FreezeRequest, DebtEscalationState, EscalationPhase, SupportTicket, SupportTicketStatus, UnrecognizedMessage, UnrecognizedMessageStatus,
  TransferNotification, TransferReport, NameMapping, TransferNotificationStatus, TransferReportStatus,
  SmsMessage, SmsMessageCategory, SmsMessageStatus, QuickReplyTemplate, ScheduledSms,
  PhoneNumberEntry, WalletTransaction, WalletType, WalletTxnType,
  CompanyBalanceTxn, RechargeCompanyId,
} from '@/types';
import { WALLET_TYPES, ELECTRONIC_WALLET_TYPES, RECHARGE_COMPANIES } from '@/types';
import { storage, type BackupData, DEFAULT_SETTINGS } from './storage';
import { Platform } from 'react-native';
import { DEFAULT_BUSINESS_HOURS } from './storage';
import { createEscalationState, processReminderTick, processCustomerReply, executeFreeze, reactivateFromPaymentOrPromise, createFreezeRequestFromState, findEscalationByPhone } from './debt-escalation';
import { buildReminderMessage, buildAskForDateMessage, buildFreezeWarningMessage, buildReactivationMessage } from './reply-parser';
import { sendMessageByChannel, isSupplierOrAgentPhone, type MessageChannel, importDeviceSms, type ImportedSms, sendSmsAuto } from './sms-gateway';
import { sendLocalNotification, ensureNotificationPermissions } from './notifications';
import { classifyIncomingMessage, classifyRechargeWithDuration, openWhatsApp, buildRechargeConfirmedMessage, buildSupportForwardMessage, buildWelcomeMessage } from './customer-classifier';
import { parseTransferSms, isTransferReport, parseTransferReport, matchPhoneToCustomer } from './transfer-parser';
import { classifySmsMessage } from './sms-classifier';
import { fetchOutboxStatuses } from './sms-gateway';
import { normalizeName, extractNameTokens, matchNameAgainstCustomers } from './name-matcher';
import { isAgentOpen, isStoreOpen, createDefaultSchedule, isSupplierWorkHours } from './business-hours';
import { isToday, calculateProfit, predictStockOut, normalizePhoneNumber } from './format';
import { getOrCreateLicense, evaluateLicense, validateActivationKey, applyActivation, isReadOnly } from './license-engine';
import { buildTransactionMessage, publishSyncEvent } from './sync';
import {
  pushCollection,
  pullAllCollections,
  startRealtimeSync,
  type SyncCollectionName,
} from './data-sync';
import { syncBusinessHoursToNative, startScreenshotDetection, stopScreenshotDetection, setNativeSupabaseCredentials, setNativeSupabaseCredentialsV2, setSmsGatewayEnabled } from './native-bridge';
import { buildCustomerFiles, type CustomerFile } from './customer-files';
import { shareBackupFile, pickBackupFile } from './backup-export';
import { uploadCloudSnapshot, listCloudSnapshots, downloadCloudSnapshot, deleteCloudSnapshot, type CloudSnapshot, type FullBackupData } from './cloud-backup';
import { supabase } from './supabase';
import { useAuth } from './auth-context';

interface AppData {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  suppliers: Supplier[];
  expenses: Expense[];
  shifts: Shift[];
  drafts: DraftBill[];
  currencies: Currency[];
  staff: Staff[];
  promotions: Promotion[];
  stocktakes: Stocktake[];
  attachments: Attachment[];
  currentStaff: Staff | null;
  smartAlerts: SmartAlert[];
  license: LicenseInfo | null;
  readOnlyMode: boolean;
  settings: Settings;
  auditLog: AuditEntry[];
  loaded: boolean;
  stats: DashboardStats;
  predictions: StockPrediction[];
  activeShift: Shift | null;

  telecomCompanies: TelecomCompany[];
  simCards: SimCard[];
  bundles: Bundle[];
  subAgents: SubAgent[];
  debtReminders: DebtReminderSchedule[];
  telecomSales: TelecomSale[];
  agentBundles: AgentBundle[];
  simLocations: SimLocation[];
  simLocationStock: SimLocationStock[];
  telecomSuppliers: TelecomSupplier[];
  shipments: Shipment[];
  rechargeRequests: RechargeRequest[];

  businessHours: BusinessHoursConfig;
  keywordReplies: KeywordReply[];
  pendingOperations: PendingOperation[];
  freezeRequests: FreezeRequest[];
  supportTickets: SupportTicket[];
  unrecognizedMessages: UnrecognizedMessage[];
  transferNotifications: TransferNotification[];
  transferReports: TransferReport[];
  nameMappings: NameMapping[];
  customerFiles: CustomerFile[];

  updateBusinessHours: (updates: Partial<BusinessHoursConfig>) => void;
  addKeywordReply: (r: Omit<KeywordReply, 'id' | 'createdAt'>) => KeywordReply;
  updateKeywordReply: (id: string, updates: Partial<KeywordReply>) => void;
  deleteKeywordReply: (id: string) => void;
  addPendingOperation: (op: Omit<PendingOperation, 'id' | 'createdAt' | 'executedAt' | 'status'>) => PendingOperation;
  updatePendingOperation: (id: string, updates: Partial<PendingOperation>) => void;
  deletePendingOperation: (id: string) => void;
  executePendingOperation: (id: string) => void;
  processEscalationReply: (saleId: string, replyText: string) => void;
  checkEscalationReminders: () => void;
  executeFreezeRequest: (id: string) => void;
  cancelFreezeRequest: (id: string) => void;
  reactivateSale: (saleId: string, reason: string) => void;
  addSupportTicket: (ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt'>) => SupportTicket;
  updateSupportTicket: (id: string, updates: Partial<SupportTicket>) => void;
  deleteSupportTicket: (id: string) => void;
  forwardSupportReply: (ticketId: string, replyText: string) => void;
  confirmRechargeBySupport: (ticketId: string, replyText: string) => void;

  learnFromMessage: (id: string, reply: string, keywords: string[]) => void;
  ignoreUnrecognizedMessage: (id: string) => void;
  deleteUnrecognizedMessage: (id: string) => void;

  addTransferNotification: (tn: Omit<TransferNotification, 'id' | 'createdAt'>) => TransferNotification;
  updateTransferNotification: (id: string, updates: Partial<TransferNotification>) => void;
  deleteTransferNotification: (id: string) => void;
  confirmTransferNotification: (id: string, pendingOpId: string | null, saleId: string | null) => void;
  rejectTransferNotification: (id: string, reason: string) => void;
  addTransferReport: (tr: Omit<TransferReport, 'id' | 'createdAt'>) => TransferReport;
  updateTransferReport: (id: string, updates: Partial<TransferReport>) => void;
  deleteTransferReport: (id: string) => void;
  addNameMapping: (fromName: string, toCustomerId: string | null, toCustomerName: string, toCustomerPhone: string) => void;
  deleteNameMapping: (id: string) => void;
  linkTransferNotification: (notificationId: string, pendingOpId: string | null, saleId: string | null, customerId: string | null) => void;

  smsMessages: SmsMessage[];
  addSmsMessage: (m: Omit<SmsMessage, 'id' | 'timestamp'>) => SmsMessage;
  updateSmsMessage: (id: string, updates: Partial<SmsMessage>) => void;
  deleteSmsMessage: (id: string) => void;
  markSmsRead: (id: string) => void;
  sendSmsReply: (phone: string, body: string, subscriptionId?: number) => Promise<{ success: boolean; error?: string }>;
  logOutboundSms: (phone: string, body: string, channel?: MessageChannel, subscriptionId?: number) => Promise<{ success: boolean; error?: string }>;
  importDeviceSmsMessages: () => Promise<{ success: boolean; imported: number; error?: string }>;

  // SMS inbox extras
  pinnedConversations: string[];
  togglePinConversation: (phone: string) => void;
  blockedNumbers: string[];
  toggleBlockNumber: (phone: string) => void;
  isNumberBlocked: (phone: string) => boolean;
  archivedConversations: string[];
  toggleArchiveConversation: (phone: string) => void;
  quickReplyTemplates: QuickReplyTemplate[];
  addQuickReplyTemplate: (t: Omit<QuickReplyTemplate, 'id' | 'createdAt'>) => QuickReplyTemplate;
  updateQuickReplyTemplate: (id: string, updates: Partial<QuickReplyTemplate>) => void;
  deleteQuickReplyTemplate: (id: string) => void;
  scheduledMessages: ScheduledSms[];
  addScheduledMessage: (s: Omit<ScheduledSms, 'id' | 'createdAt'>) => ScheduledSms;
  deleteScheduledMessage: (id: string) => void;
  checkScheduledMessages: () => void;
  phoneNumbers: PhoneNumberEntry[];
  addPhoneNumber: (e: Omit<PhoneNumberEntry, 'id' | 'createdAt' | 'updatedAt'>) => PhoneNumberEntry;
  updatePhoneNumber: (id: string, updates: Partial<PhoneNumberEntry>) => void;
  deletePhoneNumber: (id: string) => void;
  linkPhoneNumbersToTransactions: () => number;
  addRechargeRequest: (r: Omit<RechargeRequest, 'id' | 'createdAt'>) => RechargeRequest;
  updateRechargeRequest: (id: string, updates: Partial<RechargeRequest>) => void;
  deleteRechargeRequest: (id: string) => void;
  confirmRechargeRequest: (id: string) => void;
  checkRechargeAlerts: () => void;

  addTelecomCompany: (c: Omit<TelecomCompany, 'id' | 'createdAt' | 'updatedAt'>) => TelecomCompany;
  updateTelecomCompany: (id: string, updates: Partial<TelecomCompany>) => void;
  deleteTelecomCompany: (id: string) => void;

  addSimCard: (s: Omit<SimCard, 'id' | 'createdAt' | 'updatedAt'>) => SimCard;
  updateSimCard: (id: string, updates: Partial<SimCard>) => void;
  deleteSimCard: (id: string) => void;

  addBundle: (b: Omit<Bundle, 'id' | 'createdAt' | 'updatedAt'>) => Bundle;
  updateBundle: (id: string, updates: Partial<Bundle>) => void;
  deleteBundle: (id: string) => void;

  addSubAgent: (a: Omit<SubAgent, 'id' | 'createdAt' | 'updatedAt' | 'balance'>) => SubAgent;
  updateSubAgent: (id: string, updates: Partial<SubAgent>) => void;
  deleteSubAgent: (id: string) => void;
  rechargeSubAgent: (id: string, amount: number) => void;

  addTelecomSale: (s: Omit<TelecomSale, 'id' | 'createdAt'>, createdAt?: number) => TelecomSale;
  updateTelecomSale: (id: string, updates: Partial<TelecomSale>) => void;
  deleteTelecomSale: (id: string) => void;
  cancelTelecomSale: (id: string) => void;
  editTelecomSalePrice: (id: string, newSalePrice: number) => void;
  collectTelecomSaleDebt: (id: string, amount: number) => void;
  checkAutoRenewals: () => void;

  addDebtReminder: (r: Omit<DebtReminderSchedule, 'id' | 'createdAt' | 'lastSent' | 'nextSend'>) => DebtReminderSchedule;
  updateDebtReminder: (id: string, updates: Partial<DebtReminderSchedule>) => void;
  deleteDebtReminder: (id: string) => void;
  checkAndSendReminders: () => void;

  addAgentBundle: (b: Omit<AgentBundle, 'id' | 'createdAt' | 'updatedAt'>) => AgentBundle;
  updateAgentBundle: (id: string, updates: Partial<AgentBundle>) => void;
  deleteAgentBundle: (id: string) => void;

  addSimLocation: (l: Omit<SimLocation, 'id' | 'createdAt' | 'updatedAt'>) => SimLocation;
  updateSimLocation: (id: string, updates: Partial<SimLocation>) => void;
  deleteSimLocation: (id: string) => void;
  addSimLocationStock: (s: Omit<SimLocationStock, 'id' | 'createdAt' | 'updatedAt'>) => SimLocationStock;
  updateSimLocationStock: (id: string, updates: Partial<SimLocationStock>) => void;
  deleteSimLocationStock: (id: string) => void;

  addTelecomSupplier: (s: Omit<TelecomSupplier, 'id' | 'createdAt' | 'updatedAt'>) => TelecomSupplier;
  updateTelecomSupplier: (id: string, updates: Partial<TelecomSupplier>) => void;
  deleteTelecomSupplier: (id: string) => void;

  addShipment: (s: Omit<Shipment, 'id' | 'createdAt'>) => Shipment;
  deleteShipment: (id: string) => void;

  addProduct: (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  addCustomer: (c: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'debt' | 'loyaltyPoints' | 'balance'>) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  createCustomerFiles: () => void;
  mergeDuplicateCustomers: () => number;
  recordPayment: (customerId: string, amount: number) => Transaction;
  updatePayment: (id: string, amount: number) => void;
  addCustomerBalance: (customerId: string, amount: number, note: string, settleDebt?: boolean) => Transaction;
  redeemLoyalty: (customerId: string, points: number) => void;

  addSupplier: (s: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'balance'>) => Supplier;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  recordSupplierPayment: (supplierId: string, amount: number) => Transaction;
  recordPurchase: (supplierId: string, items: { productId: string; quantity: number; cost: number }[], updateCost: boolean) => Transaction;

  addTransaction: (t: Omit<Transaction, 'id' | 'createdAt'>) => Transaction;
  deleteTransaction: (id: string) => void;
  processReturn: (originalTxnId: string, items: { productId: string; quantity: number }[], reason: string) => Transaction | null;

  addExpense: (amount: number, category: string, description: string, walletType: WalletType) => Expense;
  deleteExpense: (id: string) => void;

  // Wallet / Treasury
  walletTxns: WalletTransaction[];
  getWalletBalance: (walletType: WalletType) => number;
  getTotalWalletsBalance: () => number;
  getCashBalance: () => number;
  addWalletTransaction: (t: Omit<WalletTransaction, 'id' | 'createdAt'>) => WalletTransaction;
  transferBetweenWallets: (from: WalletType, to: WalletType, amount: number, note: string) => void;
  adjustWalletBalance: (walletType: WalletType, newBalance: number, note: string) => void;
  deleteWalletTransaction: (id: string) => void;
  recordSupplierWalletPayment: (supplierId: string, amount: number, walletType: WalletType) => Transaction;

  // Recharge company balances
  companyBalanceTxns: CompanyBalanceTxn[];
  getCompanyBalance: (companyId: RechargeCompanyId) => number;
  getTotalCompaniesBalance: () => number;
  addCompanyBalanceTxn: (t: Omit<CompanyBalanceTxn, 'id' | 'createdAt'>) => CompanyBalanceTxn;
  deleteCompanyBalanceTxn: (id: string) => void;

  openShift: (openingCash: number) => Shift;
  closeShift: (closingCash: number) => Shift | null;

  saveDraft: (draft: Omit<DraftBill, 'id' | 'createdAt'>) => DraftBill;
  deleteDraft: (id: string) => void;

  updateCurrency: (code: string, rate: number) => void;

  addStaff: (s: Omit<Staff, 'id' | 'createdAt'>) => Staff;
  updateStaff: (id: string, updates: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
  staffLogin: (pin: string) => Staff | null;
  staffLogout: () => void;

  addPromotion: (p: Omit<Promotion, 'id'>) => Promotion;
  updatePromotion: (id: string, updates: Partial<Promotion>) => void;
  deletePromotion: (id: string) => void;

  addStocktake: (items: { productId: string; actualQty: number }[], staffId: string | null) => Stocktake;
  deleteStocktake: (id: string) => void;

  addAttachment: (a: Omit<Attachment, 'id' | 'createdAt'>) => Attachment;
  deleteAttachment: (id: string) => void;

  activateLicense: (key: string, plan: LicensePlan) => ActivationResult;
  refreshLicense: () => void;

  updateSettings: (updates: Partial<Settings>) => void;
  resetAllData: () => Promise<void>;
  seedDemoData: () => Promise<void>;
  createBackup: () => Promise<void>;
  restoreBackup: () => Promise<boolean>;
  hasBackup: () => Promise<boolean>;
  exportBackupFile: () => Promise<boolean>;
  importBackupFile: () => Promise<boolean>;
  uploadCloudBackup: (label?: string) => Promise<{ success: boolean; error?: string }>;
  listCloudBackups: () => Promise<{ data: CloudSnapshot[] | null; error?: string }>;
  restoreCloudBackup: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteCloudBackup: (id: string) => Promise<{ success: boolean; error?: string }>;
  addAuditEntry: (action: AuditAction, entity: string, entityId: string, description: string) => void;
  clearAuditLog: () => void;
}

const AppContext = createContext<AppData | null>(null);

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of remote) map.set(item.id, item);
  return Array.from(map.values());
}

function mergeRemote<T extends { id: string }>(
  setter: (fn: (prev: T[]) => T[]) => void,
  remote: T[] | undefined,
  saveFn: (items: T[]) => void,
) {
  if (!remote) return;
  setter((prev) => {
    const merged = mergeById(prev, remote);
    saveFn(merged);
    return merged;
  });
}

const normalizeAgentBundles = (items: AgentBundle[]): AgentBundle[] => items.map((bundle): AgentBundle => {
  if (bundle.bundleType === 'offer') {
    return { ...bundle, prices: { '3_months': bundle.prices?.['3_months'] ?? 0 } };
  }
  if (bundle.bundleType === 'monthly') {
    return { ...bundle, prices: { month: bundle.prices?.['month'] ?? 0 } };
  }
  if (bundle.prices?.['3_months'] != null) {
    return { ...bundle, bundleType: 'offer', prices: { '3_months': bundle.prices['3_months'] } };
  }
  return { ...bundle, bundleType: 'monthly', prices: { month: bundle.prices?.['month'] ?? 0 } };
});

const DEFAULT_STATS: DashboardStats = {
  todaySales: 0,
  todayProfit: 0,
  totalDebt: 0,
  totalProducts: 0,
  lowStockCount: 0,
  todayTransactions: 0,
  totalCustomers: 0,
  todayExpenses: 0,
  totalSuppliersBalance: 0,
  expiringProductsCount: 0,
  oldDebtsCount: 0,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [walletTxns, setWalletTxns] = useState<WalletTransaction[]>([]);
  const [companyBalanceTxns, setCompanyBalanceTxns] = useState<CompanyBalanceTxn[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [drafts, setDrafts] = useState<DraftBill[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [telecomCompanies, setTelecomCompanies] = useState<TelecomCompany[]>([]);
  const [simCards, setSimCards] = useState<SimCard[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [debtReminders, setDebtReminders] = useState<DebtReminderSchedule[]>([]);
  const [telecomSales, setTelecomSales] = useState<TelecomSale[]>([]);
  const [agentBundles, setAgentBundles] = useState<AgentBundle[]>([]);
  const [simLocations, setSimLocations] = useState<SimLocation[]>([]);
  const [simLocationStock, setSimLocationStock] = useState<SimLocationStock[]>([]);
  const [telecomSuppliers, setTelecomSuppliers] = useState<TelecomSupplier[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig>(DEFAULT_BUSINESS_HOURS);
  const [keywordReplies, setKeywordReplies] = useState<KeywordReply[]>([]);
  const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);
  const [freezeRequests, setFreezeRequests] = useState<FreezeRequest[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [unrecognizedMessages, setUnrecognizedMessages] = useState<UnrecognizedMessage[]>([]);
  const [transferNotifications, setTransferNotifications] = useState<TransferNotification[]>([]);
  const [transferReports, setTransferReports] = useState<TransferReport[]>([]);
  const [nameMappings, setNameMappings] = useState<NameMapping[]>([]);
  const [smsMessages, setSmsMessages] = useState<SmsMessage[]>([]);
  const [pinnedConversations, setPinnedConversations] = useState<string[]>([]);
  const [blockedNumbers, setBlockedNumbers] = useState<string[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<string[]>([]);
  const [quickReplyTemplates, setQuickReplyTemplates] = useState<QuickReplyTemplate[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledSms[]>([]);
  const [customerFiles, setCustomerFiles] = useState<CustomerFile[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberEntry[]>([]);
  const currentStaff = staff.find((s) => s.id === currentStaffId) ?? null;
  const syncSkipPushRef = useRef<Set<string>>(new Set());
  const pendingSyncPushRef = useRef<Map<SyncCollectionName, Record<string, unknown> | unknown[]>>(new Map());
  const syncPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncUnsubscribeRef = useRef<(() => void) | null>(null);
  const remoteChangeHandlerRef = useRef<((collection: SyncCollectionName, data: Record<string, unknown> | unknown[]) => void) | null>(null);
  const smsEventPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smsEventSeenIdsRef = useRef<Set<number>>(new Set());
  const smsMessagesRef = useRef<SmsMessage[]>([]);
  const customerFilesBuildingRef = useRef(false);
  const deletedCustomerIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void storage.getCustomerFiles().then(setCustomerFiles);
  }, []);

  useEffect(() => {
    if (!session) {
      setLoaded(false);
      return;
    }
    if (Platform.OS === 'web' && typeof window === 'undefined') { setLoaded(true); return; }
    (async () => {
      const s = await storage.getSettings();
      const [p, c, t, a, sup, exp, sh, dr, cur, stf, prom, stkt, att, csi, lic, tc, sims, bdls, sags, drms, tsales, abundles, slocs, slocstock, tsups, shpmnts, rreqs, bhrs, kwreplies, pendops, freezereqs, suptickets, unrecmsgs, tnotifs, treports, nmappings, smstmp, pinned, blocked, archived, quickReplies, scheduled, phoneNums, wtxns, cbtxns] = await Promise.all([
        storage.getProducts(),
        storage.getCustomers(),
        storage.getTransactions(),
        storage.getAuditLog(),
        storage.getSuppliers(),
        storage.getExpenses(),
        storage.getShifts(),
        storage.getDrafts(),
        storage.getCurrencies(),
        storage.getStaff(),
        storage.getPromotions(),
        storage.getStocktakes(),
        storage.getAttachments(),
        storage.getCurrentStaffId(),
        getOrCreateLicense(s.trialDays),
        storage.getTelecomCompanies(),
        storage.getSimCards(),
        storage.getBundles(),
        storage.getSubAgents(),
        storage.getDebtReminders(),
        storage.getTelecomSales(),
        storage.getAgentBundles(),
        storage.getSimLocations(),
        storage.getSimLocationStock(),
        storage.getTelecomSuppliers(),
        storage.getShipments(),
        storage.getRechargeRequests(),
        storage.getBusinessHours(),
        storage.getKeywordReplies(),
        storage.getPendingOperations(),
        storage.getFreezeRequests(),
        storage.getSupportTickets(),
        storage.getUnrecognizedMessages(),
        storage.getTransferNotifications(),
        storage.getTransferReports(),
        storage.getNameMappings(),
        storage.getSmsMessages(),
        storage.getPinnedConversations(),
        storage.getBlockedNumbers(),
        storage.getArchivedConversations(),
        storage.getQuickReplyTemplates(),
        storage.getScheduledMessages(),
        storage.getPhoneNumbers(),
        storage.getWalletTxns(),
        storage.getCompanyBalanceTxns(),
      ]);
      setCustomers(c);
      setTransactions(t);
      setSettings(s);
      setAuditLog(a);
      setSuppliers(sup);
      setExpenses(exp);
      setShifts(sh);
      setDrafts(dr);
      setCurrencies(cur);
      setStaff(stf);
      setPromotions(prom);
      setStocktakes(stkt);
      setAttachments(att);
      setCurrentStaffId(csi);
      setLicense(lic);
      setTelecomCompanies(tc);
      setSimCards(sims);
      setBundles(bdls);
      setSubAgents(sags);
      setDebtReminders(drms);
      setTelecomSales(tsales);
      const normalizedAgentBundles = normalizeAgentBundles(abundles);
      setAgentBundles(normalizedAgentBundles);
      storage.saveAgentBundles(normalizedAgentBundles);
      setSimLocations(slocs);
      setSimLocationStock(slocstock);
      setTelecomSuppliers(tsups);
      setShipments(shpmnts);
      setRechargeRequests(rreqs);
      setBusinessHours(bhrs);
      setKeywordReplies(kwreplies);
      setPendingOperations(pendops);
      setFreezeRequests(freezereqs);
      setSupportTickets(suptickets);
      setUnrecognizedMessages(unrecmsgs);
      setTransferNotifications(tnotifs);
      setTransferReports(treports);
      setNameMappings(nmappings);
      setSmsMessages(smstmp as SmsMessage[]);
      setPinnedConversations(pinned);
      setBlockedNumbers(blocked);
      setArchivedConversations(archived);
      setQuickReplyTemplates(quickReplies);
      setScheduledMessages(scheduled);
      setPhoneNumbers(phoneNums);
      setWalletTxns(wtxns);
      setCompanyBalanceTxns(cbtxns);

      (async () => {
        type RemoteData = Partial<Record<SyncCollectionName, Record<string, unknown> | unknown[]>>;
        let remote: RemoteData = {};
        try {
          remote = await Promise.race([
            pullAllCollections() as Promise<RemoteData>,
            new Promise<RemoteData>(resolve => setTimeout(() => resolve({}), 15000)),
          ]);
        } catch {
          remote = {};
        }
        if (remote && Object.keys(remote).length > 0) {
          mergeRemote(setProducts, remote.products as Product[], storage.saveProducts);
          if (remote.customers) {
            const filtered = (remote.customers as Customer[]).filter((c) => !deletedCustomerIdsRef.current.has(c.id));
            mergeRemote(setCustomers, filtered, storage.saveCustomers);
          }
          mergeRemote(setTransactions, remote.transactions as Transaction[], storage.saveTransactions);
          if (remote.settings) { const s = remote.settings as unknown as Settings; setSettings(s); storage.saveSettings(s); }
          mergeRemote(setAuditLog, remote.auditLog as AuditEntry[], storage.saveAuditLog);
          mergeRemote(setSuppliers, remote.suppliers as Supplier[], storage.saveSuppliers);
          mergeRemote(setExpenses, remote.expenses as Expense[], storage.saveExpenses);
          mergeRemote(setShifts, remote.shifts as Shift[], storage.saveShifts);
          mergeRemote(setDrafts, remote.drafts as DraftBill[], storage.saveDrafts);
          if (remote.currencies) { setCurrencies(remote.currencies as Currency[]); storage.saveCurrencies(remote.currencies as Currency[]); }
          mergeRemote(setStaff, remote.staff as Staff[], storage.saveStaff);
          mergeRemote(setPromotions, remote.promotions as Promotion[], storage.savePromotions);
          mergeRemote(setStocktakes, remote.stocktakes as Stocktake[], storage.saveStocktakes);
          mergeRemote(setAttachments, remote.attachments as Attachment[], storage.saveAttachments);
          mergeRemote(setTelecomCompanies, remote.telecomCompanies as TelecomCompany[], storage.saveTelecomCompanies);
          mergeRemote(setSimCards, remote.simCards as SimCard[], storage.saveSimCards);
          mergeRemote(setBundles, remote.bundles as Bundle[], storage.saveBundles);
          mergeRemote(setSubAgents, remote.subAgents as SubAgent[], storage.saveSubAgents);
          mergeRemote(setDebtReminders, remote.debtReminders as DebtReminderSchedule[], storage.saveDebtReminders);
          mergeRemote(setTelecomSales, remote.telecomSales as TelecomSale[], storage.saveTelecomSales);
          if (remote.agentBundles) { setAgentBundles((prev) => { const merged = normalizeAgentBundles(mergeById(prev, remote.agentBundles as AgentBundle[])); storage.saveAgentBundles(merged); return merged; }); }
          mergeRemote(setSimLocations, remote.simLocations as SimLocation[], storage.saveSimLocations);
          mergeRemote(setSimLocationStock, remote.simLocationStock as SimLocationStock[], storage.saveSimLocationStock);
          mergeRemote(setTelecomSuppliers, remote.telecomSuppliers as TelecomSupplier[], storage.saveTelecomSuppliers);
          mergeRemote(setShipments, remote.shipments as Shipment[], storage.saveShipments);
          mergeRemote(setRechargeRequests, remote.rechargeRequests as RechargeRequest[], storage.saveRechargeRequests);
          if (remote.businessHours) { setBusinessHours(remote.businessHours as unknown as BusinessHoursConfig); storage.saveBusinessHours(remote.businessHours as unknown as BusinessHoursConfig); }
          mergeRemote(setKeywordReplies, remote.keywordReplies as KeywordReply[], storage.saveKeywordReplies);
          mergeRemote(setPendingOperations, remote.pendingOperations as PendingOperation[], storage.savePendingOperations);
          mergeRemote(setFreezeRequests, remote.freezeRequests as FreezeRequest[], storage.saveFreezeRequests);
          mergeRemote(setSupportTickets, remote.supportTickets as SupportTicket[], storage.saveSupportTickets);
          mergeRemote(setUnrecognizedMessages, remote.unrecognizedMessages as UnrecognizedMessage[], storage.saveUnrecognizedMessages);
          mergeRemote(setTransferNotifications, remote.transferNotifications as TransferNotification[], storage.saveTransferNotifications);
          mergeRemote(setTransferReports, remote.transferReports as TransferReport[], storage.saveTransferReports);
          mergeRemote(setNameMappings, remote.nameMappings as NameMapping[], storage.saveNameMappings);
          mergeRemote(setCustomerFiles, remote.customerFiles as CustomerFile[], storage.saveCustomerFiles);
          mergeRemote(setSmsMessages, remote.smsMessages as SmsMessage[], storage.saveSmsMessages);
          mergeRemote(setPhoneNumbers, remote.phoneNumbers as PhoneNumberEntry[], storage.savePhoneNumbers);
        }
        const allSyncCollections: SyncCollectionName[] = [
          'products', 'customers', 'transactions', 'settings', 'auditLog',
          'suppliers', 'expenses', 'shifts', 'drafts', 'currencies',
          'staff', 'promotions', 'stocktakes', 'attachments',
          'telecomCompanies', 'simCards', 'bundles', 'subAgents',
          'debtReminders', 'telecomSales', 'agentBundles', 'simLocations',
          'simLocationStock', 'telecomSuppliers', 'shipments', 'rechargeRequests',
          'businessHours', 'keywordReplies', 'pendingOperations', 'freezeRequests',
          'supportTickets', 'unrecognizedMessages', 'transferNotifications',
          'transferReports', 'nameMappings', 'customerFiles', 'smsMessages', 'phoneNumbers',
        ];
        for (const c of allSyncCollections) {
          syncSkipPushRef.current.add(c);
        }
        // Allow all merged collections to push back to cloud
        syncSkipPushRef.current.clear();
        setLoaded(true);
        void ensureNotificationPermissions();

        const remoteHandler = (collection: SyncCollectionName, data: Record<string, unknown> | unknown[]) => {
          syncSkipPushRef.current.add(collection);
          remoteChangeHandlerRef.current = remoteHandler;
          switch (collection) {
            case 'products': mergeRemote(setProducts, data as Product[], storage.saveProducts); break;
            case 'customers': {
              const filtered = (data as Customer[]).filter((c) => !deletedCustomerIdsRef.current.has(c.id));
              mergeRemote(setCustomers, filtered, storage.saveCustomers);
              break;
            }
            case 'transactions': mergeRemote(setTransactions, data as Transaction[], storage.saveTransactions); break;
            case 'settings': { const s = data as unknown as Settings; setSettings(s); storage.saveSettings(s); break; }
            case 'auditLog': mergeRemote(setAuditLog, data as AuditEntry[], storage.saveAuditLog); break;
            case 'suppliers': mergeRemote(setSuppliers, data as Supplier[], storage.saveSuppliers); break;
            case 'expenses': mergeRemote(setExpenses, data as Expense[], storage.saveExpenses); break;
            case 'shifts': mergeRemote(setShifts, data as Shift[], storage.saveShifts); break;
            case 'drafts': mergeRemote(setDrafts, data as DraftBill[], storage.saveDrafts); break;
            case 'currencies': setCurrencies(data as Currency[]); storage.saveCurrencies(data as Currency[]); break;
            case 'staff': mergeRemote(setStaff, data as Staff[], storage.saveStaff); break;
            case 'promotions': mergeRemote(setPromotions, data as Promotion[], storage.savePromotions); break;
            case 'stocktakes': mergeRemote(setStocktakes, data as Stocktake[], storage.saveStocktakes); break;
            case 'attachments': mergeRemote(setAttachments, data as Attachment[], storage.saveAttachments); break;
            case 'telecomCompanies': mergeRemote(setTelecomCompanies, data as TelecomCompany[], storage.saveTelecomCompanies); break;
            case 'simCards': mergeRemote(setSimCards, data as SimCard[], storage.saveSimCards); break;
            case 'bundles': mergeRemote(setBundles, data as Bundle[], storage.saveBundles); break;
            case 'subAgents': mergeRemote(setSubAgents, data as SubAgent[], storage.saveSubAgents); break;
            case 'debtReminders': mergeRemote(setDebtReminders, data as DebtReminderSchedule[], storage.saveDebtReminders); break;
            case 'telecomSales': mergeRemote(setTelecomSales, data as TelecomSale[], storage.saveTelecomSales); break;
            case 'agentBundles': { setAgentBundles((prev) => { const merged = normalizeAgentBundles(mergeById(prev, data as AgentBundle[])); storage.saveAgentBundles(merged); return merged; }); break; }
            case 'simLocations': mergeRemote(setSimLocations, data as SimLocation[], storage.saveSimLocations); break;
            case 'simLocationStock': mergeRemote(setSimLocationStock, data as SimLocationStock[], storage.saveSimLocationStock); break;
            case 'telecomSuppliers': mergeRemote(setTelecomSuppliers, data as TelecomSupplier[], storage.saveTelecomSuppliers); break;
            case 'shipments': mergeRemote(setShipments, data as Shipment[], storage.saveShipments); break;
            case 'rechargeRequests': mergeRemote(setRechargeRequests, data as RechargeRequest[], storage.saveRechargeRequests); break;
            case 'businessHours': setBusinessHours(data as unknown as BusinessHoursConfig); storage.saveBusinessHours(data as unknown as BusinessHoursConfig); break;
            case 'keywordReplies': mergeRemote(setKeywordReplies, data as KeywordReply[], storage.saveKeywordReplies); break;
            case 'pendingOperations': mergeRemote(setPendingOperations, data as PendingOperation[], storage.savePendingOperations); break;
            case 'freezeRequests': mergeRemote(setFreezeRequests, data as FreezeRequest[], storage.saveFreezeRequests); break;
            case 'supportTickets': mergeRemote(setSupportTickets, data as SupportTicket[], storage.saveSupportTickets); break;
            case 'unrecognizedMessages': mergeRemote(setUnrecognizedMessages, data as UnrecognizedMessage[], storage.saveUnrecognizedMessages); break;
            case 'transferNotifications': mergeRemote(setTransferNotifications, data as TransferNotification[], storage.saveTransferNotifications); break;
            case 'transferReports': mergeRemote(setTransferReports, data as TransferReport[], storage.saveTransferReports); break;
            case 'nameMappings': mergeRemote(setNameMappings, data as NameMapping[], storage.saveNameMappings); break;
            case 'customerFiles': mergeRemote(setCustomerFiles, data as CustomerFile[], storage.saveCustomerFiles); break;
            case 'smsMessages': mergeRemote(setSmsMessages, data as SmsMessage[], storage.saveSmsMessages); break;
            case 'phoneNumbers': mergeRemote(setPhoneNumbers, data as PhoneNumberEntry[], storage.savePhoneNumbers); break;
            case 'customerReplies': {
              const reply = data as { senderPhone?: string; senderName?: string; message?: string; timestamp?: number; channel?: string };
              if (reply && reply.message && (reply.senderPhone || reply.channel === 'bank_notification' || reply.senderName)) {
                const smsClassResult = classifySmsMessage(reply.message, reply.senderPhone);
                const smsMsg: SmsMessage = {
                  id: storage.generateId(),
                  direction: 'inbound',
                  senderPhone: reply.senderPhone,
                  senderName: reply.senderName || (smsClassResult.isTransfer ? (parseTransferSms(reply.message).senderName ?? '') : ''),
                  body: reply.message,
                  category: smsClassResult.category,
                  status: 'new',
                  processAction: smsClassResult.processAction,
                  linkedPendingOpId: null,
                  linkedTransferNotificationId: null,
                  linkedSupportTicketId: null,
                  linkedUnrecognizedMsgId: null,
                  autoReplied: false,
                  autoReplyText: null,
                  timestamp: reply.timestamp ?? Date.now(),
                  readAt: null,
                  sendStatus: 'none' as const,
                  outboxEventId: null,
                };
                setSmsMessages((prev) => { const next = [smsMsg, ...prev]; storage.saveSmsMessages(next); return next; });
                const incomingChannel: MessageChannel = reply.channel === 'whatsapp' ? 'whatsapp' : 'sms';
                const isSupplierOrAgent = isSupplierOrAgentPhone(reply.senderPhone, suppliersRef.current, subAgentsRef.current);
                // If sender is a supplier/agent, always reply via WhatsApp regardless of incoming channel
                const replyChannel: MessageChannel = isSupplierOrAgent ? 'whatsapp' : incomingChannel;
                const match = findEscalationByPhone(telecomSalesRef.current, reply.senderPhone);
                if (match) {
                  processEscalationReplyRef.current(match.sale.id, reply.message);
                }
                const templates = settingsRef.current?.autoReplyTemplates ?? null;
                const result = classifyIncomingMessage(reply.message, reply.senderPhone, telecomSalesRef.current, telecomCompaniesRef.current, templates, keywordRepliesRef.current, bundlesRef.current, settingsRef.current?.storeName, agentBundlesRef.current, reply.senderName);

                // Check if this is a bank/wallet transfer notification (not a customer message)
                const parsedTransfer = parseTransferSms(reply.message);
                if (parsedTransfer.isTransfer) {
                  const senderLabel = parsedTransfer.senderName || parsedTransfer.senderPhone || 'غير معروف';
                  const tnId = storage.generateId();
                  const tn: TransferNotification = {
                    id: tnId,
                    rawSms: reply.message,
                    senderName: parsedTransfer.senderName,
                    senderPhone: parsedTransfer.senderPhone,
                    senderNameNormalized: parsedTransfer.senderName ? extractNameTokens(parsedTransfer.senderName) : [],
                    amount: parsedTransfer.amount,
                    currency: parsedTransfer.currency,
                    bankName: parsedTransfer.bankName,
                    reference: parsedTransfer.reference,
                    receivedAt: reply.timestamp ?? Date.now(),
                    status: 'pending' as TransferNotificationStatus,
                    matchedPendingOpId: null,
                    matchedTransferReportId: null,
                    matchedSaleId: null,
                    matchedCustomerId: null,
                    confirmedAt: null,
                    confirmedBy: null,
                    rejectedReason: '',
                    createdAt: Date.now(),
                  };
                  setTransferNotifications((prev) => { const next = [tn, ...prev]; storage.saveTransferNotifications(next); return next; });
                  autoMatchTransferNotificationRef.current(tn);
                  void sendLocalNotification('تحويل وارد', `${senderLabel} - ${parsedTransfer.amount} ${parsedTransfer.currency}`);
                  break;
                }

                if (result.replyToCustomer) {
                  void logOutboundSmsRef.current(reply.senderPhone, result.replyToCustomer, replyChannel);
                }
                const sale = telecomSalesRef.current.find((s) => s.simNumber === result.simNumber);
                const agent = sale ? subAgentsRef.current.find((a) => a.id === sale.subAgentId) : null;
                const agentOpen = agent ? isAgentOpen(agent) : true;
                const offHoursMsg = templates?.offHoursMessage ?? 'عذراً، الشركة مغلقة حالياً ولا يمكن تنفيذ طلبك. سيتم تنفيذه مع بدء دوام الغد إن شاء الله.';
                // recharge_forward: send to company support directly, no ticket, no pending op
                if (result.action === 'recharge_forward' && result.supportPhone && result.supportMessage) {
                  if (!agentOpen && agent) {
                    void logOutboundSmsRef.current(reply.senderPhone, offHoursMsg, replyChannel);
                    const ticket: SupportTicket = {
                      id: storage.generateId(),
                      saleId: sale?.id ?? null,
                      customerName: result.customerName ?? '',
                      customerPhone: reply.senderPhone,
                      simNumber: result.simNumber ?? '',
                      companyName: sale?.companyName ?? '',
                      companySupportPhone: result.supportPhone,
                      originalMessage: reply.message,
                      supportMessage: result.supportMessage,
                      status: 'queued_off_hours' as const,
                      whatsappOpened: false,
                      customerReplySent: offHoursMsg,
                      autoForwarded: false,
                      forwardReason: 'off_hours',
                      rechargeConfirmedAt: null,
                      queuedForSubAgentId: agent.id,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    };
                    setSupportTickets((prev) => { const next = [ticket, ...prev]; storage.saveSupportTickets(next); return next; });
                    void sendLocalNotification('طلب دعم فني - خارج الدوام', `الرقم ${result.simNumber ?? ''} - ${result.customerName ?? ''} - تم إرجاء الطلب لفتح الوكالة`);
                  } else {
                    void logOutboundSmsRef.current(result.supportPhone, result.supportMessage, 'whatsapp');
                  }
                }
                if ((result.action === 'support_forward' || result.action === 'urgency') && result.supportPhone && result.supportMessage && result.simNumber) {
                  if (!agentOpen && agent && result.action !== 'urgency') {
                    void logOutboundSmsRef.current(reply.senderPhone, offHoursMsg, replyChannel);
                    const ticket: SupportTicket = {
                      id: storage.generateId(),
                      saleId: sale?.id ?? null,
                      customerName: result.customerName ?? '',
                      customerPhone: reply.senderPhone,
                      simNumber: result.simNumber,
                      companyName: sale?.companyName ?? '',
                      companySupportPhone: result.supportPhone,
                      originalMessage: reply.message,
                      supportMessage: result.supportMessage,
                      status: 'queued_off_hours' as const,
                      whatsappOpened: false,
                      customerReplySent: offHoursMsg,
                      autoForwarded: false,
                      forwardReason: 'off_hours',
                      rechargeConfirmedAt: null,
                      queuedForSubAgentId: agent.id,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    };
                    setSupportTickets((prev) => { const next = [ticket, ...prev]; storage.saveSupportTickets(next); return next; });
                    void sendLocalNotification('طلب دعم فني - خارج الدوام', `الرقم ${result.simNumber} - ${result.customerName ?? ''} - تم إرجاء الطلب لفتح الوكالة`);
                  } else {
                    const ticket: SupportTicket = {
                      id: storage.generateId(),
                      saleId: sale?.id ?? null,
                      customerName: result.customerName ?? '',
                      customerPhone: reply.senderPhone,
                      simNumber: result.simNumber,
                      companyName: sale?.companyName ?? '',
                      companySupportPhone: result.supportPhone,
                      originalMessage: reply.message,
                      supportMessage: result.supportMessage,
                      status: result.action === 'urgency' ? 'auto_forwarded' as const : 'pending' as const,
                      whatsappOpened: false,
                      customerReplySent: null,
                      autoForwarded: result.action === 'urgency',
                      forwardReason: result.action === 'urgency' ? 'urgency' : 'internet_problem',
                      rechargeConfirmedAt: null,
                      queuedForSubAgentId: null,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    };
                    setSupportTickets((prev) => { const next = [ticket, ...prev]; storage.saveSupportTickets(next); return next; });
                    void sendLocalNotification('طلب دعم فني', `الرقم ${result.simNumber} - ${result.customerName ?? ''} - ${result.action === 'urgency' ? 'عاجل' : 'مشكلة إنترنت'}`);
                  }
                }
                if (result.action === 'specify_duration' && result.replyToCustomer) {
                  void logOutboundSmsRef.current(reply.senderPhone, result.replyToCustomer, replyChannel);
                  void sendLocalNotification('طلب تحديد المدة', `من ${reply.senderPhone}: ${reply.message.slice(0, 50)}`);
                }
                // eSIM flow actions — send reply and notify
                if (result.action.startsWith('esim_') && result.replyToCustomer) {
                  void logOutboundSmsRef.current(reply.senderPhone, result.replyToCustomer, replyChannel);
                  const esimNotifTitle: Record<string, string> = {
                    esim_ask_phone_model: 'طلب eSIM - سؤال نوع الجوال',
                    esim_not_supported: 'eSIM - جوال غير مدعوم',
                    esim_ask_company: 'eSIM - اختيار الشركة',
                    esim_ask_bundle: 'eSIM - عرض الباقات',
                    esim_bundle_list: 'eSIM - إعادة عرض الباقات',
                    esim_transfer_to_staff: 'eSIM - تحويل للموظف',
                    esim_company_list: 'eSIM - قائمة الشركات',
                  };
                  void sendLocalNotification(esimNotifTitle[result.action] ?? 'طلب eSIM', `من ${reply.senderPhone}: ${reply.message.slice(0, 50)}`);
                }
                // eSIM transfer to staff — create a pending operation for manual handling
                if (result.action === 'esim_transfer_to_staff') {
                  const op: PendingOperation = {
                    id: storage.generateId(),
                    source: 'sms' as const,
                    senderPhone: reply.senderPhone,
                    senderName: result.customerName ?? '',
                    simNumber: '',
                    originalMessage: reply.message,
                    status: 'pending' as const,
                    customerMatched: false,
                    customerId: null,
                    customerName: result.customerName ?? '',
                    customerPhone: reply.senderPhone,
                    companyGuess: '',
                    bundleGuess: '',
                    createdAt: Date.now(),
                    executedAt: null,
                    transferReportId: null,
                    transferNotificationId: null,
                    transferStatus: 'none' as const,
                    chargeDuration: null,
                    companyName: result.companyName ?? null,
                  };
                  setPendingOperations((prev) => { const next = [op, ...prev]; storage.savePendingOperations(next); return next; });
                }
                if (result.action === 'recharge_request') {
                  if (result.simNumber) {
                  const sale = result.saleId ? telecomSalesRef.current.find((s) => s.id === result.saleId) : null;
                  const shopOpen = businessHoursRef.current ? isStoreOpen(businessHoursRef.current) : true;
                  const reqAgent = sale ? subAgentsRef.current.find((a) => a.id === sale.subAgentId) : null;
                  const reqAgentOpen = reqAgent ? isAgentOpen(reqAgent) : true;
                  const reqSupportPhone = sale ? (telecomCompaniesRef.current.find((c) => c.id === sale.companyId)?.supportPhone || null) : null;
                  // Shop closed but agent open → forward directly to company support
                  if (!shopOpen && reqAgentOpen && reqSupportPhone && sale) {
                    const fwdMsg = buildSupportForwardMessage(result.simNumber, templates);
                    void logOutboundSmsRef.current(reqSupportPhone, fwdMsg, 'whatsapp');
                    const ticket: SupportTicket = {
                      id: storage.generateId(),
                      saleId: sale.id,
                      customerName: result.customerName ?? '',
                      customerPhone: reply.senderPhone,
                      simNumber: result.simNumber,
                      companyName: sale.companyName,
                      companySupportPhone: reqSupportPhone,
                      originalMessage: reply.message,
                      supportMessage: fwdMsg,
                      status: 'auto_forwarded' as const,
                      whatsappOpened: false,
                      customerReplySent: result.replyToCustomer,
                      autoForwarded: true,
                      forwardReason: 'off_hours_shop_closed' as const,
                      rechargeConfirmedAt: null,
                      queuedForSubAgentId: null,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    };
                    setSupportTickets((prev) => { const next = [ticket, ...prev]; storage.saveSupportTickets(next); return next; });
                    void sendLocalNotification('طلب شحن محوّل للدعم', `الرقم ${result.simNumber} - ${result.customerName ?? ''} - تم التحويل للدعم الفني`);
                  }
                  const op: PendingOperation = {
                    id: storage.generateId(),
                    source: 'sms' as const,
                    senderPhone: reply.senderPhone,
                    senderName: result.customerName ?? '',
                    simNumber: result.simNumber,
                    originalMessage: reply.message,
                    status: 'pending' as const,
                    customerMatched: !!sale?.customerId,
                    customerId: sale?.customerId ?? null,
                    customerName: result.customerName ?? '',
                    customerPhone: reply.senderPhone,
                    companyGuess: sale?.companyId ?? '',
                    bundleGuess: sale?.bundleName ?? '',
                    createdAt: Date.now(),
                    executedAt: null,
                    transferReportId: null,
                    transferNotificationId: null,
                    transferStatus: 'none' as const,
                    chargeDuration: result.chargeDuration ?? null,
                    companyName: result.companyName ?? sale?.companyName ?? null,
                  };
                  setPendingOperations((prev) => { const next = [op, ...prev]; storage.savePendingOperations(next); return next; });
                  void sendLocalNotification('عملية قيد الانتظار', `طلب شحن للرقم ${result.simNumber} من ${result.customerName ?? reply.senderPhone}`);
                  } else {
                    // eSIM recharge request without a sim number
                    const op: PendingOperation = {
                      id: storage.generateId(),
                      source: 'sms' as const,
                      senderPhone: reply.senderPhone,
                      senderName: result.customerName ?? '',
                      simNumber: '',
                      originalMessage: reply.message,
                      status: 'pending' as const,
                      customerMatched: false,
                      customerId: null,
                      customerName: result.customerName ?? '',
                      customerPhone: reply.senderPhone,
                      companyGuess: '',
                      bundleGuess: '',
                      createdAt: Date.now(),
                      executedAt: null,
                      transferReportId: null,
                      transferNotificationId: null,
                      transferStatus: 'none' as const,
                      chargeDuration: result.chargeDuration ?? null,
                      companyName: result.companyName ?? null,
                    };
                    setPendingOperations((prev) => { const next = [op, ...prev]; storage.savePendingOperations(next); return next; });
                    void sendLocalNotification('طلب eSIM قيد الانتظار', `من ${reply.senderPhone} - شركة ${result.companyName ?? 'غير محدد'} - مدة ${result.chargeDuration ?? 'غير محدد'}`);
                  }
                }
                // Greeting for first-time / unknown customers — auto-reply sent above via result.replyToCustomer
                if (result.action === 'greeting') {
                  void sendLocalNotification('زبون جديد', `من ${reply.senderPhone}: ${reply.message.slice(0, 50)}`);
                }
                // Unrecognized message — queue for user to teach a reply, but still send a reply
                if (result.action === 'default') {
                  // Known customer with no specific match — send welcome as fallback reply
                  if (!result.replyToCustomer) {
                    const fallbackReply = buildWelcomeMessage(result.customerName ?? 'زبوننا العزيز', result.daysRemaining ?? 0, templates);
                    void logOutboundSmsRef.current(reply.senderPhone, fallbackReply, replyChannel);
                  }
                  const existing = unrecognizedMessagesRef.current.find((m) => m.senderPhone === reply.senderPhone && m.originalMessage === reply.message && m.status === 'pending');
                  if (!existing) {
                    const msg: UnrecognizedMessage = {
                      id: storage.generateId(),
                      senderPhone: reply.senderPhone,
                      senderName: result.customerName ?? '',
                      originalMessage: reply.message,
                      status: 'pending' as const,
                      learnedReply: null,
                      learnedKeywords: [],
                      createdAt: Date.now(),
                      resolvedAt: null,
                    };
                    setUnrecognizedMessages((prev) => { const next = [msg, ...prev]; storage.saveUnrecognizedMessages(next); return next; });
                    void sendLocalNotification('رسالة غير معروفة', `من ${reply.senderPhone}: ${reply.message.slice(0, 50)}`);
                  }
                }
              }
              break;
            }
          }
        };
        syncUnsubscribeRef.current = startRealtimeSync(remoteHandler);
      })();
    })();

    return () => {
      syncUnsubscribeRef.current?.();
    };
  }, [session]);

  // Poll sms_inbox_events for real-time SMS delivery from Android phone
  useEffect(() => {
    if (!loaded || !session) return;
    const pollSmsEvents = async () => {
      try {
        // Atomically claim unprocessed rows to prevent race conditions across devices/tabs.
        // The RPC marks rows as processed in a single operation with FOR UPDATE SKIP LOCKED.
        const { data: claimedRows, error: claimError } = await supabase
          .rpc('claim_sms_inbox_events', { p_limit: 20 });

        if (claimError || !claimedRows || claimedRows.length === 0) return;

        const data = claimedRows as any[];
        const newIds: number[] = [];
        for (const row of data) {
          if (smsEventSeenIdsRef.current.has(row.id)) continue;
          smsEventSeenIdsRef.current.add(row.id);
          newIds.push(row.id);

          if (row.event_type === 'customerReply') {
            const replyData = {
              senderPhone: row.sender_phone,
              senderName: row.sender_name ?? '',
              message: row.message,
              channel: row.channel ?? 'sms',
              timestamp: new Date(row.created_at).getTime(),
            };
            remoteChangeHandlerRef.current?.('customerReplies', replyData);
          } else if (row.event_type === 'pendingOperation') {
            const op: PendingOperation = {
              id: storage.generateId(),
              source: (row.source ?? 'sms') as 'sms',
              senderPhone: row.sender_phone,
              senderName: '',
              simNumber: row.sim_number ?? '',
              originalMessage: row.message,
              status: 'pending',
              customerMatched: false,
              customerId: null,
              customerName: '',
              customerPhone: row.sender_phone,
              companyGuess: '',
              bundleGuess: '',
              createdAt: new Date(row.created_at).getTime(),
              executedAt: null,
              transferReportId: null,
              transferNotificationId: null,
              transferStatus: 'none' as const,
              chargeDuration: null,
              companyName: null,
            };
            setPendingOperations((prev) => { const next = [op, ...prev]; storage.savePendingOperations(next); return next; });
            void sendLocalNotification('عملية قيد الانتظار', `من ${row.sender_phone}: ${row.message.slice(0, 50)}`);
          }
        }

        // Rows are already marked processed by the claim_sms_inbox_events RPC.

        // Trim seen IDs
        if (smsEventSeenIdsRef.current.size > 500) {
          const toRemove = smsEventSeenIdsRef.current.size - 250;
          let removed = 0;
          for (const id of smsEventSeenIdsRef.current) {
            if (removed >= toRemove) break;
            smsEventSeenIdsRef.current.delete(id);
            removed++;
          }
        }
      } catch {
        // ignore
      }
    };

    void pollSmsEvents();
    smsEventPollRef.current = setInterval(() => void pollSmsEvents(), 15000);

    return () => {
      if (smsEventPollRef.current) clearInterval(smsEventPollRef.current);
    };
  }, [loaded, session]);

  const syncPush = useCallback(<T,>(collection: SyncCollectionName, data: T) => {
    if (syncSkipPushRef.current.has(collection)) {
      syncSkipPushRef.current.delete(collection);
      return;
    }
    pendingSyncPushRef.current.set(collection, data as unknown as Record<string, unknown> | unknown[]);
    if (syncPushTimerRef.current) return;
    syncPushTimerRef.current = setTimeout(() => {
      syncPushTimerRef.current = null;
      const uid = session?.user?.id;
      for (const [col, d] of pendingSyncPushRef.current) {
        void pushCollection(col, d, uid);
      }
      pendingSyncPushRef.current.clear();
    }, 2000);
  }, [session]);

  // Auto-push local state changes to cloud (skips during remote-pull echo)
  useEffect(() => { if (loaded) syncPush('products', products); }, [products, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('customers', customers); }, [customers, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('transactions', transactions); }, [transactions, loaded, syncPush]);
  useEffect(() => { if (loaded && settings) syncPush('settings', settings); }, [settings, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('auditLog', auditLog); }, [auditLog, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('suppliers', suppliers); }, [suppliers, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('expenses', expenses); }, [expenses, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('shifts', shifts); }, [shifts, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('drafts', drafts); }, [drafts, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('currencies', currencies); }, [currencies, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('staff', staff); }, [staff, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('promotions', promotions); }, [promotions, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('stocktakes', stocktakes); }, [stocktakes, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('attachments', attachments); }, [attachments, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('telecomCompanies', telecomCompanies); }, [telecomCompanies, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('simCards', simCards); }, [simCards, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('bundles', bundles); }, [bundles, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('subAgents', subAgents); }, [subAgents, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('debtReminders', debtReminders); }, [debtReminders, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('telecomSales', telecomSales); }, [telecomSales, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('agentBundles', agentBundles); }, [agentBundles, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('simLocations', simLocations); }, [simLocations, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('simLocationStock', simLocationStock); }, [simLocationStock, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('telecomSuppliers', telecomSuppliers); }, [telecomSuppliers, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('shipments', shipments); }, [shipments, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('rechargeRequests', rechargeRequests); }, [rechargeRequests, loaded, syncPush]);
  useEffect(() => { if (loaded && businessHours) syncPush('businessHours', businessHours); }, [businessHours, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('keywordReplies', keywordReplies); }, [keywordReplies, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('pendingOperations', pendingOperations); }, [pendingOperations, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('freezeRequests', freezeRequests); }, [freezeRequests, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('supportTickets', supportTickets); }, [supportTickets, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('unrecognizedMessages', unrecognizedMessages); }, [unrecognizedMessages, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('transferNotifications', transferNotifications); }, [transferNotifications, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('transferReports', transferReports); }, [transferReports, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('nameMappings', nameMappings); }, [nameMappings, loaded, syncPush]);
  useEffect(() => { if (loaded && customerFiles.length > 0) syncPush('customerFiles', customerFiles); }, [customerFiles, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('smsMessages', smsMessages); }, [smsMessages, loaded, syncPush]);
  useEffect(() => { if (loaded) syncPush('phoneNumbers', phoneNumbers); }, [phoneNumbers, loaded, syncPush]);

  // Keep smsMessagesRef in sync for use in polling without re-triggering the effect
  useEffect(() => { smsMessagesRef.current = smsMessages; }, [smsMessages]);

  // Poll sms_outbox for status updates on outbound messages with pending sendStatus
  // Uses a ref + stable interval so it doesn't tear down on every smsMessages change
  useEffect(() => {
    if (!loaded || !session) return;
    let cancelled = false;
    const poll = async () => {
      const pendingEventIds = smsMessagesRef.current
        .filter((m) => m.direction === 'outbound' && m.sendStatus === 'pending' && m.outboxEventId)
        .map((m) => m.outboxEventId!);
      if (pendingEventIds.length === 0) return;
      const statuses = await fetchOutboxStatuses(pendingEventIds);
      if (cancelled || Object.keys(statuses).length === 0) return;
      setSmsMessages((prev) => {
        let changed = false;
        const next = prev.map((m) => {
          if (m.outboxEventId && statuses[m.outboxEventId]) {
            const s = statuses[m.outboxEventId];
            if (s.status === 'sent' && m.sendStatus !== 'sent') { changed = true; return { ...m, sendStatus: 'sent' as const }; }
            if (s.status === 'failed' && m.sendStatus !== 'failed') { changed = true; return { ...m, sendStatus: 'failed' as const }; }
          }
          return m;
        });
        if (changed) storage.saveSmsMessages(next);
        return changed ? next : prev;
      });
    };
    const interval = setInterval(() => void poll(), 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [loaded, session]);

  useEffect(() => {
    if (!loaded || customerFiles.length === 0 || customerFilesBuildingRef.current) return;
    customerFilesBuildingRef.current = true;
    const next = buildCustomerFiles(customers, transactions, telecomSales, pendingOperations, customerFiles);
    customerFilesBuildingRef.current = false;
    if (next.length !== customerFiles.length || next.some((f, i) => f.customerIds.length !== customerFiles[i]?.customerIds.length || f.transactionIds.length !== customerFiles[i]?.transactionIds.length || f.pendingOperationIds.length !== customerFiles[i]?.pendingOperationIds.length)) {
      setCustomerFiles(next);
      void storage.saveCustomerFiles(next);
    }
  }, [loaded, customers, transactions, telecomSales, pendingOperations, customerFiles]);

  // Sync business hours + telecom data to native SharedPreferences for offline SMS handling
  // Throttled to avoid re-syncing on every telecomSale change
  const nativeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (nativeSyncTimerRef.current) clearTimeout(nativeSyncTimerRef.current);
    nativeSyncTimerRef.current = setTimeout(() => {
      syncBusinessHoursToNative({
        autoMode: businessHours.autoMode,
        enableAutoReply: businessHours.enableAutoReply,
        enableCallRejection: businessHours.enableCallRejection,
        enableDnd: businessHours.enableDnd,
        enableSmsMonitoring: settings.enableSmsMonitoring,
        enableWhatsappMonitoring: settings.enableWhatsappMonitoring,
        openMessage: businessHours.openMessage,
        closedMessage: businessHours.closedMessage,
        greetingMessage: settings.autoReplyTemplates?.greeting
          ? settings.autoReplyTemplates.greeting.replaceAll('{storeName}', settings.storeName || 'متجرنا')
          : `أهلاً وسهلاً بك في ${settings.storeName || 'متجرنا'}، يسعدنا خدمتك. كيف يمكننا مساعدتك اليوم؟`,
        autoReplyCooldownMinutes: businessHours.autoReplyCooldownMinutes,
        days: businessHours.days,
        keywordReplies,
        telecomSales: telecomSales.map((s) => ({ simNumber: s.simNumber, companyName: s.companyName })),
        telecomCompanies: telecomCompanies.map((c) => ({ id: c.id, name: c.name })),
        bundles: bundles.filter((b) => b.active).map((b) => ({ id: b.id, companyId: b.companyId, companyName: b.companyName, name: b.name, price: b.price, durationDays: b.durationDays, active: b.active })),
      });
    }, 3000);
  }, [loaded, businessHours, settings, keywordReplies, telecomSales, telecomCompanies]);

  // Screenshot detection: pass Supabase credentials to native module and start/stop service
  useEffect(() => {
    if (!loaded) return;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    // Pass the user's authenticated access token so native services can make
    // RLS-protected Supabase calls. The anon key won't work after tightening RLS.
    const accessToken = session?.access_token || '';
    if (supabaseUrl && accessToken) {
      setNativeSupabaseCredentials(supabaseUrl, accessToken);
      setNativeSupabaseCredentialsV2(supabaseUrl, accessToken, session?.user?.id ?? '');
    }
    if (settings.enableScreenshotDetection) {
      startScreenshotDetection();
    } else {
      stopScreenshotDetection();
    }
  }, [loaded, settings.enableScreenshotDetection, session?.access_token]);

  // Toggle SMS gateway service in native SharedPreferences
  useEffect(() => {
    if (!loaded) return;
    setSmsGatewayEnabled(!!settings.enableSmsMonitoring);
  }, [loaded, settings.enableSmsMonitoring]);

  const addAuditEntry = useCallback((action: AuditAction, entity: string, entityId: string, description: string) => {
    const entry: AuditEntry = {
      id: storage.generateId(),
      action,
      entity,
      entityId,
      description,
      user: currentStaff?.name || settings?.ownerName || 'المالك',
      timestamp: Date.now(),
    };
    setAuditLog((prev) => {
      const next = [entry, ...prev].slice(0, 500);
      storage.saveAuditLog(next);
      return next;
    });
  }, [settings, currentStaff]);

  // ============ Products ============
  const addProduct: AppData['addProduct'] = useCallback((p) => {
    const product: Product = { ...p, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setProducts((prev) => { const next = [product, ...prev]; storage.saveProducts(next); return next; });
    addAuditEntry('create', 'product', product.id, `إضافة منتج: ${product.name}`);
    return product;
  }, [addAuditEntry]);

  const updateProduct: AppData['updateProduct'] = useCallback((id, updates) => {
    let oldPrice = 0;
    setProducts((prev) => {
      const next = prev.map((p) => {
        if (p.id === id) { oldPrice = p.price; return { ...p, ...updates, updatedAt: Date.now() }; }
        return p;
      });
      storage.saveProducts(next);
      return next;
    });
    if (updates.price !== undefined && updates.price !== oldPrice) {
      addAuditEntry('price_change', 'product', id, `تغيير سعر منتج من ${oldPrice} إلى ${updates.price}`);
    } else {
      addAuditEntry('update', 'product', id, 'تعديل منتج');
    }
  }, [addAuditEntry]);

  const deleteProduct: AppData['deleteProduct'] = useCallback((id) => {
    setProducts((prev) => { const next = prev.filter((p) => p.id !== id); storage.saveProducts(next); return next; });
    addAuditEntry('delete', 'product', id, 'حذف منتج');
  }, [addAuditEntry]);

  // ============ Customers ============
  const addCustomer: AppData['addCustomer'] = useCallback((c) => {
    const customer: Customer = { ...c, debt: 0, balance: 0, loyaltyPoints: 0, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setCustomers((prev) => { const next = [customer, ...prev]; storage.saveCustomers(next); return next; });
    addAuditEntry('create', 'customer', customer.id, `إضافة عميل: ${customer.name}`);
    return customer;
  }, [addAuditEntry]);

  const updateCustomer: AppData['updateCustomer'] = useCallback((id, updates) => {
    setCustomers((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c);
      storage.saveCustomers(next);
      return next;
    });
    addAuditEntry('update', 'customer', id, 'تعديل عميل');
  }, [addAuditEntry]);

  const deleteCustomer: AppData['deleteCustomer'] = useCallback((id) => {
    deletedCustomerIdsRef.current.add(id);
    setCustomers((prev) => { const next = prev.filter((c) => c.id !== id); storage.saveCustomers(next); return next; });
    addAuditEntry('delete', 'customer', id, 'حذف عميل');
  }, [addAuditEntry]);

  const createCustomerFiles: AppData['createCustomerFiles'] = useCallback(() => {
    const next = buildCustomerFiles(customers, transactions, telecomSales, pendingOperations, customerFiles);
    setCustomerFiles(next);
    void storage.saveCustomerFiles(next);
    addAuditEntry('create', 'customer_files', 'all', `إنشاء ملفات ${next.length} زبون`);
  }, [customers, transactions, telecomSales, pendingOperations, customerFiles, addAuditEntry]);

  const mergeDuplicateCustomers: AppData['mergeDuplicateCustomers'] = useCallback(() => {
    const groups = new Map<string, Customer[]>();
    for (const c of customers) {
      const key = normalizePhoneNumber(c.phone);
      const arr = groups.get(key);
      if (arr) arr.push(c);
      else groups.set(key, [c]);
    }

    let mergedCount = 0;
    const idsToDelete = new Set<string>();
    const customerMergeMap = new Map<string, string>();
    const primaryUpdates = new Map<string, Partial<Customer>>();

    for (const [, group] of groups) {
      if (group.length <= 1) continue;
      const primary = group.reduce((best, c) => {
        if (!best) return c;
        const bestScore = (best.debt > 0 ? 1 : 0) + (best.balance > 0 ? 1 : 0) + (best.loyaltyPoints > 0 ? 1 : 0) + (best.notes ? 1 : 0) + (best.subscriptionNumber ? 1 : 0);
        const cScore = (c.debt > 0 ? 1 : 0) + (c.balance > 0 ? 1 : 0) + (c.loyaltyPoints > 0 ? 1 : 0) + (c.notes ? 1 : 0) + (c.subscriptionNumber ? 1 : 0);
        if (cScore > bestScore) return c;
        if (cScore === bestScore && c.createdAt < best.createdAt) return c;
        return best;
      }, group[0]);

      const duplicates = group.filter((c) => c.id !== primary.id);
      for (const dup of duplicates) {
        idsToDelete.add(dup.id);
        customerMergeMap.set(dup.id, primary.id);
      }

      const mergedDebt = group.reduce((s, c) => s + c.debt, 0);
      const mergedBalance = group.reduce((s, c) => s + c.balance, 0);
      const mergedLoyalty = group.reduce((s, c) => s + c.loyaltyPoints, 0);
      const mergedNotes = group.map((c) => c.notes).filter(Boolean).join(' | ');
      const mergedSub = primary.subscriptionNumber || duplicates.find((d) => d.subscriptionNumber)?.subscriptionNumber || '';
      const mergedSubExpiry = primary.subscriptionExpiry ?? duplicates.find((d) => d.subscriptionExpiry)?.subscriptionExpiry ?? null;
      const mergedTier = group.some((c) => c.tier === 'vip') ? 'vip' : primary.tier;
      const mergedCreditLimit = Math.max(...group.map((c) => c.creditLimit));
      const mergedDiscount = Math.max(...group.map((c) => c.discountPercent));

      primaryUpdates.set(primary.id, {
        debt: mergedDebt,
        balance: mergedBalance,
        loyaltyPoints: mergedLoyalty,
        notes: mergedNotes || primary.notes,
        subscriptionNumber: mergedSub,
        subscriptionExpiry: mergedSubExpiry,
        tier: mergedTier,
        creditLimit: mergedCreditLimit,
        discountPercent: mergedDiscount,
        updatedAt: Date.now(),
      });

      mergedCount += duplicates.length;
    }

    if (mergedCount === 0) return 0;

    for (const id of idsToDelete) deletedCustomerIdsRef.current.add(id);

    setTelecomSales((prev) => {
      const next = prev.map((s) => {
        const newId = customerMergeMap.get(s.customerId ?? '');
        return newId ? { ...s, customerId: newId } : s;
      });
      storage.saveTelecomSales(next);
      return next;
    });

    setTransactions((prev) => {
      const next = prev.map((t) => {
        const newId = customerMergeMap.get(t.customerId ?? '');
        return newId ? { ...t, customerId: newId } : t;
      });
      storage.saveTransactions(next);
      return next;
    });

    setPendingOperations((prev) => {
      const next = prev.map((op) => {
        const newId = customerMergeMap.get(op.customerId ?? '');
        return newId ? { ...op, customerId: newId } : op;
      });
      storage.savePendingOperations(next);
      return next;
    });

    setDebtReminders((prev) => {
      const next = prev.map((r) => {
        const newId = customerMergeMap.get(r.customerId);
        return newId ? { ...r, customerId: newId } : r;
      });
      storage.saveDebtReminders(next);
      return next;
    });

    const mergedCustomers = customers
      .filter((c) => !idsToDelete.has(c.id))
      .map((c) => {
        const updates = primaryUpdates.get(c.id);
        return updates ? { ...c, ...updates } : c;
      });

    setCustomers(() => {
      storage.saveCustomers(mergedCustomers);
      return mergedCustomers;
    });
    void pushCollection('customers', mergedCustomers, session?.user?.id);

    const nextFiles = buildCustomerFiles(
      mergedCustomers,
      transactions, telecomSales, pendingOperations, customerFiles,
    );
    setCustomerFiles(nextFiles);
    void storage.saveCustomerFiles(nextFiles);

    addAuditEntry('update', 'customer', 'all', `دمج ${mergedCount} سجل زبون مكرر`);
    return mergedCount;
  }, [customers, transactions, telecomSales, pendingOperations, customerFiles, addAuditEntry]);

  const addCustomerBalance: AppData['addCustomerBalance'] = useCallback((customerId, amount, note, settleDebt) => {
    const customer = customers.find((c) => c.id === customerId);
    const currentDebt = Math.max(customer?.debt ?? 0, 0);
    const debtPaid = settleDebt ? Math.min(currentDebt, amount) : 0;
    const balanceAdded = Math.max(0, amount - debtPaid);
    const txn: Transaction = {
      id: storage.generateId(),
      createdAt: Date.now(),
      type: 'payment',
      customerId,
      customerName: customer?.name ?? '',
      supplierId: null,
      supplierName: '',
      items: [],
      total: 0,
      paid: amount,
      remaining: 0,
      paymentMethod: 'wallet',
      splitPayment: null,
      debtChange: -debtPaid,
      loyaltyEarned: 0,
      note: note || 'شحن رصيد مسبق',
      smsSent: false,
      returnReason: '',
      originalTxnId: null,
      currencyCode: settings?.defaultCurrencyCode ?? 'SAR',
      shiftId: null,
      staffId: currentStaffId,
      staffName: currentStaff?.name ?? '',
      promotionApplied: null,
      discountAmount: 0,
      walletType: null,
    };
    setTransactions((prev) => { const next = [txn, ...prev]; storage.saveTransactions(next); return next; });
    setCustomers((prev) => {
      const next = prev.map((c) => c.id === customerId ? {
        ...c,
        debt: Math.max(0, c.debt - debtPaid),
        balance: c.balance + balanceAdded,
        updatedAt: Date.now(),
      } : c);
      storage.saveCustomers(next);
      return next;
    });
    addAuditEntry('payment', 'customer', txn.id, `شحن ${amount} - سداد دين ${debtPaid} - إضافة رصيد ${balanceAdded} - ${customer?.name ?? ''}`);
    return txn;
  }, [customers, settings, currentStaffId, currentStaff, addAuditEntry]);

  const redeemLoyalty: AppData['redeemLoyalty'] = useCallback((customerId, points) => {
    setCustomers((prev) => {
      const next = prev.map((c) => c.id === customerId ? { ...c, loyaltyPoints: Math.max(0, c.loyaltyPoints - points), updatedAt: Date.now() } : c);
      storage.saveCustomers(next);
      return next;
    });
    addAuditEntry('update', 'customer', customerId, `استبدال ${points} نقطة ولاء`);
  }, [addAuditEntry]);

  // ============ Suppliers ============
  const addSupplier: AppData['addSupplier'] = useCallback((s) => {
    const supplier: Supplier = { ...s, balance: 0, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setSuppliers((prev) => { const next = [supplier, ...prev]; storage.saveSuppliers(next); return next; });
    addAuditEntry('create', 'supplier', supplier.id, `إضافة مورد: ${supplier.name}`);
    return supplier;
  }, [addAuditEntry]);

  const updateSupplier: AppData['updateSupplier'] = useCallback((id, updates) => {
    setSuppliers((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s);
      storage.saveSuppliers(next);
      return next;
    });
    addAuditEntry('update', 'supplier', id, 'تعديل مورد');
  }, [addAuditEntry]);

  const deleteSupplier: AppData['deleteSupplier'] = useCallback((id) => {
    setSuppliers((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveSuppliers(next); return next; });
    addAuditEntry('delete', 'supplier', id, 'حذف مورد');
  }, [addAuditEntry]);

  const recordSupplierPayment: AppData['recordSupplierPayment'] = useCallback((supplierId, amount) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    const txn: Transaction = {
      id: storage.generateId(),
      createdAt: Date.now(),
      type: 'supplier_payment',
      customerId: null,
      customerName: '',
      supplierId,
      supplierName: supplier?.name ?? '',
      items: [],
      total: amount,
      paid: amount,
      remaining: 0,
      paymentMethod: 'cash',
      splitPayment: null,
      debtChange: 0,
      loyaltyEarned: 0,
      note: '',
      smsSent: false,
      returnReason: '',
      originalTxnId: null,
      currencyCode: settings?.defaultCurrencyCode ?? 'SAR',
      shiftId: null,
      staffId: currentStaffId,
      staffName: currentStaff?.name ?? '',
      promotionApplied: null,
      discountAmount: 0,
      walletType: null,
    };
    setTransactions((prev) => { const next = [txn, ...prev]; storage.saveTransactions(next); return next; });
    setSuppliers((prev) => {
      const next = prev.map((s) => s.id === supplierId ? { ...s, balance: Math.max(0, s.balance - amount), updatedAt: Date.now() } : s);
      storage.saveSuppliers(next);
      return next;
    });
    addAuditEntry('supplier_payment', 'supplier', txn.id, `تسديد للمورد ${amount} - ${supplier?.name ?? ''}`);
    return txn;
  }, [suppliers, settings, currentStaffId, currentStaff, addAuditEntry]);

  const recordPurchase: AppData['recordPurchase'] = useCallback((supplierId, items, updateCost) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    let total = 0;
    const cartItems: { productId: string; name: string; price: number; cost: number; quantity: number; unit: string }[] = [];
    items.forEach((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (product) {
        total += item.cost * item.quantity;
        cartItems.push({ productId: item.productId, name: product.name, price: product.price, cost: item.cost, quantity: item.quantity, unit: product.unit });
      }
    });

    const txn: Transaction = {
      id: storage.generateId(),
      createdAt: Date.now(),
      type: 'purchase',
      customerId: null,
      customerName: '',
      supplierId,
      supplierName: supplier?.name ?? '',
      items: cartItems,
      total,
      paid: total,
      remaining: 0,
      paymentMethod: 'cash',
      splitPayment: null,
      debtChange: 0,
      loyaltyEarned: 0,
      note: '',
      smsSent: false,
      returnReason: '',
      originalTxnId: null,
      currencyCode: settings?.defaultCurrencyCode ?? 'SAR',
      shiftId: null,
      staffId: currentStaffId,
      staffName: currentStaff?.name ?? '',
      promotionApplied: null,
      discountAmount: 0,
      walletType: null,
    };
    setTransactions((prev) => { const next = [txn, ...prev]; storage.saveTransactions(next); return next; });

    // Update stock and optionally cost
    setProducts((prev) => {
      const next = prev.map((p) => {
        const purchaseItem = items.find((i) => i.productId === p.id);
        if (purchaseItem) {
          return {
            ...p,
            stock: p.stock + purchaseItem.quantity,
            cost: updateCost ? purchaseItem.cost : p.cost,
            updatedAt: Date.now(),
          };
        }
        return p;
      });
      storage.saveProducts(next);
      return next;
    });

    // Increase supplier balance (we owe them)
    setSuppliers((prev) => {
      const next = prev.map((s) => s.id === supplierId ? { ...s, balance: s.balance + total, updatedAt: Date.now() } : s);
      storage.saveSuppliers(next);
      return next;
    });

    addAuditEntry('stock_adjust', 'transaction', txn.id, `فاتورة مشتريات من ${supplier?.name ?? ''} بقيمة ${total}`);
    return txn;
  }, [suppliers, products, settings, currentStaffId, currentStaff, addAuditEntry]);

  // ============ Transactions ============
  const addTransaction: AppData['addTransaction'] = useCallback((t) => {
    const txn: Transaction = { ...t, id: storage.generateId(), createdAt: Date.now() };
    setTransactions((prev) => { const next = [txn, ...prev]; storage.saveTransactions(next); return next; });

    if (txn.type === 'sale') {
      setProducts((prev) => {
        const next = prev.map((p) => {
          const cartItem = txn.items.find((i) => i.productId === p.id);
          if (cartItem) return { ...p, stock: Math.max(0, p.stock - cartItem.quantity), updatedAt: Date.now() };
          return p;
        });
        storage.saveProducts(next);
        return next;
      });
      if (txn.customerId && settings?.enableLoyalty) {
        const pointsEarned = Math.floor(txn.total * settings.loyaltyRate);
        setCustomers((prev) => {
          const next = prev.map((c) => c.id === txn.customerId ? { ...c, loyaltyPoints: c.loyaltyPoints + pointsEarned, updatedAt: Date.now() } : c);
          storage.saveCustomers(next);
          return next;
        });
      }
      addAuditEntry('sale', 'transaction', txn.id, `بيع بقيمة ${txn.total} - ${txn.customerName}`);
    } else if (txn.type === 'purchase') {
      setProducts((prev) => {
        const next = prev.map((p) => {
          const cartItem = txn.items.find((i) => i.productId === p.id);
          if (cartItem) return { ...p, stock: p.stock + cartItem.quantity, updatedAt: Date.now() };
          return p;
        });
        storage.saveProducts(next);
        return next;
      });
    } else if (txn.type === 'return') {
      setProducts((prev) => {
        const next = prev.map((p) => {
          const retItem = txn.items.find((i) => i.productId === p.id);
          if (retItem) return { ...p, stock: p.stock + retItem.quantity, updatedAt: Date.now() };
          return p;
        });
        storage.saveProducts(next);
        return next;
      });
      addAuditEntry('return', 'transaction', txn.id, `مرتجع - السبب: ${txn.returnReason}`);
    }

    const saleCustomer = txn.customerId ? customers.find((customer) => customer.id === txn.customerId) : null;
    const customerPhone = saleCustomer?.phone ?? null;
    const postTxnDebt = saleCustomer ? Math.max(0, saleCustomer.debt + (txn.debtChange ?? 0)) : 0;
    void publishSyncEvent(
      'transaction',
      txn as unknown as Record<string, unknown>,
      customerPhone,
      settings?.enableSms && customerPhone && (txn.type === 'sale' || txn.type === 'return' || txn.type === 'payment')
        ? buildTransactionMessage(txn.type, txn.customerName, txn.total, txn.paid, txn.remaining, customerPhone, postTxnDebt)
        : null,
    );

    if (txn.customerId && txn.debtChange !== 0 && txn.type !== 'return') {
      setCustomers((prev) => {
        const next = prev.map((c) => c.id === txn.customerId ? { ...c, debt: Math.max(0, c.debt + txn.debtChange), updatedAt: Date.now() } : c);
        storage.saveCustomers(next);
        return next;
      });
    }

    if (txn.customerId && txn.paymentMethod === 'balance' && txn.type === 'sale') {
      setCustomers((prev) => {
        const next = prev.map((c) => c.id === txn.customerId ? { ...c, balance: Math.max(0, c.balance - txn.paid), updatedAt: Date.now() } : c);
        storage.saveCustomers(next);
        return next;
      });
    }

    return txn;
  }, [settings, customers, addAuditEntry]);

  const recordPayment: AppData['recordPayment'] = useCallback((customerId, amount) => {
    const customer = customers.find((c) => c.id === customerId);
    const txn: Transaction = {
      id: storage.generateId(),
      createdAt: Date.now(),
      type: 'payment',
      customerId,
      customerName: customer?.name ?? '',
      supplierId: null,
      supplierName: '',
      items: [],
      total: 0,
      paid: amount,
      remaining: 0,
      paymentMethod: 'cash',
      splitPayment: null,
      debtChange: -amount,
      loyaltyEarned: 0,
      note: '',
      smsSent: false,
      returnReason: '',
      originalTxnId: null,
      currencyCode: settings?.defaultCurrencyCode ?? 'SAR',
      shiftId: null,
      staffId: currentStaffId,
      staffName: currentStaff?.name ?? '',
      promotionApplied: null,
      discountAmount: 0,
      walletType: null,
    };
    setTransactions((prev) => { const next = [txn, ...prev]; storage.saveTransactions(next); return next; });
    setCustomers((prev) => {
      const next = prev.map((c) => c.id === customerId ? { ...c, debt: Math.max(0, c.debt - amount), updatedAt: Date.now() } : c);
      storage.saveCustomers(next);
      return next;
    });
    addAuditEntry('payment', 'transaction', txn.id, `تسديد دين ${amount} - ${customer?.name ?? ''}`);
    const paymentPhone = customer?.phone ?? null;
    const postPaymentDebt = customer ? Math.max(0, customer.debt - amount) : 0;
    void publishSyncEvent(
      'transaction',
      txn as unknown as Record<string, unknown>,
      paymentPhone,
      settings?.enableSms && paymentPhone
        ? buildTransactionMessage('payment', txn.customerName, txn.total, txn.paid, txn.remaining, paymentPhone, postPaymentDebt)
        : null,
    );
    return txn;
  }, [customers, settings, currentStaffId, currentStaff, addAuditEntry]);

  const processReturn: AppData['processReturn'] = useCallback((originalTxnId, items, reason) => {
    const original = transactions.find((t) => t.id === originalTxnId);
    if (!original) return null;

    const returnItems: { productId: string; name: string; price: number; cost: number; quantity: number; unit: string }[] = [];
    let returnTotal = 0;

    items.forEach((retItem) => {
      const origItem = original.items.find((i) => i.productId === retItem.productId);
      if (origItem && retItem.quantity > 0 && retItem.quantity <= origItem.quantity) {
        returnItems.push({
          productId: origItem.productId,
          name: origItem.name,
          price: origItem.price,
          cost: origItem.cost,
          quantity: retItem.quantity,
          unit: origItem.unit,
        });
        returnTotal += origItem.price * retItem.quantity;
      }
    });

    if (returnItems.length === 0) return null;

    const debtChange = original.customerId ? -returnTotal : 0;

    const txn: Transaction = {
      id: storage.generateId(),
      createdAt: Date.now(),
      type: 'return',
      customerId: original.customerId,
      customerName: original.customerName,
      supplierId: null,
      supplierName: '',
      items: returnItems,
      total: returnTotal,
      paid: 0,
      remaining: 0,
      paymentMethod: 'cash',
      splitPayment: null,
      debtChange,
      loyaltyEarned: 0,
      note: '',
      smsSent: false,
      returnReason: reason,
      originalTxnId,
      currencyCode: original.currencyCode,
      shiftId: null,
      staffId: currentStaffId,
      staffName: currentStaff?.name ?? '',
      promotionApplied: null,
      discountAmount: 0,
      walletType: null,
    };

    setTransactions((prev) => { const next = [txn, ...prev]; storage.saveTransactions(next); return next; });

    setProducts((prev) => {
      const next = prev.map((p) => {
        const retItem = returnItems.find((i) => i.productId === p.id);
        if (retItem) return { ...p, stock: p.stock + retItem.quantity, updatedAt: Date.now() };
        return p;
      });
      storage.saveProducts(next);
      return next;
    });

    if (original.customerId && debtChange !== 0) {
      setCustomers((prev) => {
        const next = prev.map((c) => c.id === original.customerId ? { ...c, debt: Math.max(0, c.debt + debtChange), updatedAt: Date.now() } : c);
        storage.saveCustomers(next);
        return next;
      });
    }

    addAuditEntry('return', 'transaction', txn.id, `مرتجع بقيمة ${returnTotal} - ${reason}`);
    const returnCustomer = original.customerId ? customers.find((c) => c.id === original.customerId) : null;
    const returnPhone = returnCustomer?.phone ?? null;
    const postReturnDebt = returnCustomer ? Math.max(0, returnCustomer.debt + debtChange) : 0;
    void publishSyncEvent(
      'transaction',
      txn as unknown as Record<string, unknown>,
      returnPhone,
      settings?.enableSms && returnPhone
        ? buildTransactionMessage('return', txn.customerName, txn.total, txn.paid, txn.remaining, returnPhone, postReturnDebt)
        : null,
    );
    return txn;
  }, [transactions, customers, settings, currentStaffId, currentStaff, addAuditEntry]);

  const updatePayment: AppData['updatePayment'] = useCallback((id, amount) => {
    const txn = transactions.find((t) => t.id === id);
    if (!txn || txn.type !== 'payment' || amount <= 0) return;
    const debtDifference = -amount - txn.debtChange;
    const updated: Transaction = { ...txn, paid: amount, debtChange: -amount };

    setTransactions((prev) => {
      const next = prev.map((t) => t.id === id ? updated : t);
      storage.saveTransactions(next);
      return next;
    });

    if (txn.customerId && debtDifference !== 0) {
      setCustomers((prev) => {
        const next = prev.map((c) => c.id === txn.customerId ? {
          ...c,
          debt: Math.max(0, c.debt + debtDifference),
          updatedAt: Date.now(),
        } : c);
        storage.saveCustomers(next);
        return next;
      });
    }

    addAuditEntry('update', 'transaction', id, `تعديل دفعة: ${txn.paid} → ${amount}`);
  }, [transactions, addAuditEntry]);

  const deleteTransaction: AppData['deleteTransaction'] = useCallback((id) => {
    const txn = transactions.find((t) => t.id === id);
    setTransactions((prev) => { const next = prev.filter((t) => t.id !== id); storage.saveTransactions(next); return next; });

    if (txn && txn.customerId) {
      const debtReversal = -(txn.debtChange ?? 0);
      const balanceRefund = txn.paymentMethod === 'balance' ? txn.paid : 0;

      if (debtReversal !== 0 || balanceRefund > 0) {
        setCustomers((prev) => {
          const next = prev.map((c) => c.id === txn.customerId ? {
            ...c,
            debt: Math.max(0, c.debt + debtReversal),
            balance: c.balance + balanceRefund,
            updatedAt: Date.now(),
          } : c);
          storage.saveCustomers(next);
          return next;
        });
      }
    }

    addAuditEntry('delete', 'transaction', id, `حذف معاملة - ${txn?.customerName ?? ''}`);
  }, [transactions, addAuditEntry]);

  // ============ Expenses ============
  const addExpense: AppData['addExpense'] = useCallback((amount, category, description, walletType) => {
    const activeShift = shifts.find((s) => s.status === 'open');
    const expense: Expense = {
      id: storage.generateId(),
      amount,
      category,
      description,
      shiftId: activeShift?.id ?? null,
      walletType,
      createdAt: Date.now(),
    };
    setExpenses((prev) => { const next = [expense, ...prev]; storage.saveExpenses(next); return next; });
    const wTxn: WalletTransaction = {
      id: storage.generateId(),
      walletType,
      type: 'expense',
      amount,
      category,
      description,
      relatedTxnId: expense.id,
      shiftId: activeShift?.id ?? null,
      createdAt: Date.now(),
    };
    setWalletTxns((prev) => { const next = [wTxn, ...prev]; storage.saveWalletTxns(next); return next; });
    addAuditEntry('expense', 'expense', expense.id, `مصروف: ${category} - ${amount} من ${WALLET_TYPES.find((w) => w.id === walletType)?.name ?? walletType}`);
    return expense;
  }, [shifts, addAuditEntry]);

  const deleteExpense: AppData['deleteExpense'] = useCallback((id) => {
    setExpenses((prev) => { const next = prev.filter((e) => e.id !== id); storage.saveExpenses(next); return next; });
    setWalletTxns((prev) => { const next = prev.filter((w) => w.relatedTxnId !== id); storage.saveWalletTxns(next); return next; });
  }, []);

  // ============ Wallet / Treasury ============
  const getWalletBalance: AppData['getWalletBalance'] = useCallback((walletType) => {
    return walletTxns
      .filter((w) => w.walletType === walletType)
      .reduce((sum, w) => {
        if (w.type === 'income' || w.type === 'transfer_in' || w.type === 'sale' || w.type === 'adjustment') return sum + w.amount;
        if (w.type === 'expense' || w.type === 'transfer_out' || w.type === 'supplier_payment') return sum - w.amount;
        return sum;
      }, 0);
  }, [walletTxns]);

  const getTotalWalletsBalance: AppData['getTotalWalletsBalance'] = useCallback(() => {
    return WALLET_TYPES.reduce((sum, w) => sum + getWalletBalance(w.id), 0);
  }, [getWalletBalance]);

  const getCashBalance: AppData['getCashBalance'] = useCallback(() => {
    return getWalletBalance('cash');
  }, [getWalletBalance]);

  const addWalletTransaction: AppData['addWalletTransaction'] = useCallback((t) => {
    const wTxn: WalletTransaction = { ...t, id: storage.generateId(), createdAt: Date.now() };
    setWalletTxns((prev) => { const next = [wTxn, ...prev]; storage.saveWalletTxns(next); return next; });
    return wTxn;
  }, []);

  const transferBetweenWallets: AppData['transferBetweenWallets'] = useCallback((from, to, amount, note) => {
    if (amount <= 0 || from === to) return;
    const now = Date.now();
    const outTxn: WalletTransaction = {
      id: storage.generateId(),
      walletType: from,
      type: 'transfer_out',
      amount,
      category: 'تحويل بين المحافظ',
      description: note || `تحويل إلى ${WALLET_TYPES.find((w) => w.id === to)?.name ?? to}`,
      relatedTxnId: null,
      shiftId: null,
      createdAt: now,
    };
    const inTxn: WalletTransaction = {
      id: storage.generateId(),
      walletType: to,
      type: 'transfer_in',
      amount,
      category: 'تحويل بين المحافظ',
      description: note || `تحويل من ${WALLET_TYPES.find((w) => w.id === from)?.name ?? from}`,
      relatedTxnId: outTxn.id,
      shiftId: null,
      createdAt: now,
    };
    setWalletTxns((prev) => { const next = [inTxn, outTxn, ...prev]; storage.saveWalletTxns(next); return next; });
    addAuditEntry('update', 'wallet', '', `تحويل ${amount} من ${WALLET_TYPES.find((w) => w.id === from)?.name ?? from} إلى ${WALLET_TYPES.find((w) => w.id === to)?.name ?? to}`);
  }, [addAuditEntry]);

  const adjustWalletBalance: AppData['adjustWalletBalance'] = useCallback((walletType, newBalance, note) => {
    const current = getWalletBalance(walletType);
    const diff = newBalance - current;
    if (diff === 0) return;
    const wTxn: WalletTransaction = {
      id: storage.generateId(),
      walletType,
      type: 'adjustment',
      amount: Math.abs(diff),
      category: 'تسوية رصيد',
      description: note || `تسوية رصيد ${WALLET_TYPES.find((w) => w.id === walletType)?.name ?? walletType}`,
      relatedTxnId: null,
      shiftId: null,
      createdAt: Date.now(),
    };
    setWalletTxns((prev) => {
      const next = [{ ...wTxn, amount: diff < 0 ? Math.abs(diff) : diff, type: diff < 0 ? 'expense' : 'income' } as WalletTransaction, ...prev];
      storage.saveWalletTxns(next);
      return next;
    });
    addAuditEntry('update', 'wallet', '', `تسوية رصيد ${WALLET_TYPES.find((w) => w.id === walletType)?.name}: ${diff > 0 ? '+' : ''}${diff}`);
  }, [getWalletBalance, addAuditEntry]);

  const deleteWalletTransaction: AppData['deleteWalletTransaction'] = useCallback((id) => {
    setWalletTxns((prev) => { const next = prev.filter((w) => w.id !== id); storage.saveWalletTxns(next); return next; });
  }, []);

  const recordSupplierWalletPayment: AppData['recordSupplierWalletPayment'] = useCallback((supplierId, amount, walletType) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    const txn: Transaction = {
      id: storage.generateId(),
      createdAt: Date.now(),
      type: 'supplier_payment',
      customerId: null,
      customerName: '',
      supplierId,
      supplierName: supplier?.name ?? '',
      items: [],
      total: amount,
      paid: amount,
      remaining: 0,
      paymentMethod: 'wallet',
      splitPayment: null,
      debtChange: 0,
      loyaltyEarned: 0,
      note: '',
      smsSent: false,
      returnReason: '',
      originalTxnId: null,
      currencyCode: settings?.defaultCurrencyCode ?? 'SAR',
      shiftId: null,
      staffId: currentStaffId,
      staffName: currentStaff?.name ?? '',
      promotionApplied: null,
      discountAmount: 0,
      walletType: null,
    };
    setTransactions((prev) => { const next = [txn, ...prev]; storage.saveTransactions(next); return next; });
    setSuppliers((prev) => {
      const next = prev.map((s) => s.id === supplierId ? { ...s, balance: Math.max(0, s.balance - amount), updatedAt: Date.now() } : s);
      storage.saveSuppliers(next);
      return next;
    });
    const wTxn: WalletTransaction = {
      id: storage.generateId(),
      walletType,
      type: 'supplier_payment',
      amount,
      category: 'دفع مورد',
      description: `دفع للمورد ${supplier?.name ?? ''}`,
      relatedTxnId: txn.id,
      shiftId: null,
      createdAt: Date.now(),
    };
    setWalletTxns((prev) => { const next = [wTxn, ...prev]; storage.saveWalletTxns(next); return next; });
    addAuditEntry('supplier_payment', 'supplier', txn.id, `تسديد للمورد ${amount} من ${WALLET_TYPES.find((w) => w.id === walletType)?.name ?? walletType} - ${supplier?.name ?? ''}`);
    return txn;
  }, [suppliers, settings, currentStaffId, currentStaff, addAuditEntry]);

  // ============ Recharge Company Balances ============
  const getCompanyBalance: AppData['getCompanyBalance'] = useCallback((companyId) => {
    return companyBalanceTxns
      .filter((t) => t.companyId === companyId)
      .reduce((sum, t) => {
        if (t.type === 'recharge_in') return sum + t.amount;
        if (t.type === 'recharge_out') return sum - t.amount;
        if (t.type === 'adjustment') return sum + t.amount;
        return sum;
      }, 0);
  }, [companyBalanceTxns]);

  const getTotalCompaniesBalance: AppData['getTotalCompaniesBalance'] = useCallback(() => {
    return RECHARGE_COMPANIES.reduce((sum, c) => sum + getCompanyBalance(c.id), 0);
  }, [getCompanyBalance]);

  const addCompanyBalanceTxn: AppData['addCompanyBalanceTxn'] = useCallback((t) => {
    const txn: CompanyBalanceTxn = { ...t, id: storage.generateId(), createdAt: Date.now() };
    setCompanyBalanceTxns((prev) => { const next = [txn, ...prev]; storage.saveCompanyBalanceTxns(next); return next; });
    const companyName = RECHARGE_COMPANIES.find((c) => c.id === t.companyId)?.name ?? t.companyId;
    addAuditEntry('update', 'company_balance', '', `${t.type === 'recharge_in' ? 'شحن رصيد' : t.type === 'recharge_out' ? 'خصم رصيد' : 'تسوية'} ${companyName}: ${t.amount}`);
    return txn;
  }, [addAuditEntry]);

  const deleteCompanyBalanceTxn: AppData['deleteCompanyBalanceTxn'] = useCallback((id) => {
    setCompanyBalanceTxns((prev) => { const next = prev.filter((t) => t.id !== id); storage.saveCompanyBalanceTxns(next); return next; });
  }, []);

  // ============ Shifts ============
  const openShift: AppData['openShift'] = useCallback((openingCash) => {
    const shift: Shift = {
      id: storage.generateId(),
      openedAt: Date.now(),
      closedAt: null,
      openingCash,
      closingCash: null,
      expectedCash: null,
      difference: null,
      status: 'open',
      staffId: currentStaffId,
      staffName: currentStaff?.name ?? '',
      note: '',
    };
    setShifts((prev) => { const next = [shift, ...prev]; storage.saveShifts(next); return next; });
    addAuditEntry('shift_open', 'shift', shift.id, `فتح وردية برصيد ${openingCash}`);
    return shift;
  }, [addAuditEntry, currentStaffId, currentStaff]);

  const closeShift: AppData['closeShift'] = useCallback((closingCash) => {
    const activeShift = shifts.find((s) => s.status === 'open');
    if (!activeShift) return null;

    const shiftSales = transactions
      .filter((t) => t.type === 'sale' && t.createdAt >= activeShift.openedAt)
      .reduce((sum, t) => sum + (t.paymentMethod === 'cash' ? t.paid : 0), 0);
    const shiftExpenses = expenses
      .filter((e) => e.shiftId === activeShift.id)
      .reduce((sum, e) => sum + e.amount, 0);
    const expectedCash = activeShift.openingCash + shiftSales - shiftExpenses;
    const difference = closingCash - expectedCash;

    const closed: Shift = {
      ...activeShift,
      closedAt: Date.now(),
      closingCash,
      expectedCash,
      difference,
      status: 'closed',
    };

    setShifts((prev) => {
      const next = prev.map((s) => s.id === activeShift.id ? closed : s);
      storage.saveShifts(next);
      return next;
    });
    addAuditEntry('shift_close', 'shift', closed.id, `إغلاق وردية - الفرق: ${difference}`);
    return closed;
  }, [shifts, transactions, expenses, addAuditEntry]);

  // ============ Drafts ============
  const saveDraft: AppData['saveDraft'] = useCallback((draft) => {
    const d: DraftBill = { ...draft, id: storage.generateId(), createdAt: Date.now() };
    setDrafts((prev) => { const next = [d, ...prev]; storage.saveDrafts(next); return next; });
    return d;
  }, []);

  const deleteDraft: AppData['deleteDraft'] = useCallback((id) => {
    setDrafts((prev) => { const next = prev.filter((d) => d.id !== id); storage.saveDrafts(next); return next; });
  }, []);

  // ============ Currencies ============
  const updateCurrency: AppData['updateCurrency'] = useCallback((code, rate) => {
    setCurrencies((prev) => {
      const next = prev.map((c) => c.code === code ? { ...c, rate } : c);
      storage.saveCurrencies(next);
      return next;
    });
  }, []);

  // ============ Staff ============
  const addStaff: AppData['addStaff'] = useCallback((s) => {
    const member: Staff = { ...s, id: storage.generateId(), createdAt: Date.now() };
    setStaff((prev) => { const next = [member, ...prev]; storage.saveStaff(next); return next; });
    addAuditEntry('create', 'staff', member.id, `إضافة موظف: ${member.name}`);
    return member;
  }, [addAuditEntry]);

  const updateStaff: AppData['updateStaff'] = useCallback((id, updates) => {
    setStaff((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, ...updates } : s);
      storage.saveStaff(next);
      return next;
    });
    addAuditEntry('update', 'staff', id, 'تعديل موظف');
  }, [addAuditEntry]);

  const deleteStaff: AppData['deleteStaff'] = useCallback((id) => {
    setStaff((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveStaff(next); return next; });
    addAuditEntry('delete', 'staff', id, 'حذف موظف');
  }, [addAuditEntry]);

  const staffLogin: AppData['staffLogin'] = useCallback((pin) => {
    const member = staff.find((s) => s.pin === pin && s.active);
    if (member) {
      setCurrentStaffId(member.id);
      storage.saveCurrentStaffId(member.id);
      addAuditEntry('login', 'staff', member.id, `تسجيل دخول: ${member.name}`);
      return member;
    }
    return null;
  }, [staff, addAuditEntry]);

  const staffLogout: AppData['staffLogout'] = useCallback(() => {
    setCurrentStaffId(null);
    storage.saveCurrentStaffId(null);
  }, []);

  // ============ Promotions ============
  const addPromotion: AppData['addPromotion'] = useCallback((p) => {
    const promo: Promotion = { ...p, id: storage.generateId() };
    setPromotions((prev) => { const next = [promo, ...prev]; storage.savePromotions(next); return next; });
    addAuditEntry('promotion', 'promotion', promo.id, `إضافة عرض: ${promo.name}`);
    return promo;
  }, [addAuditEntry]);

  const updatePromotion: AppData['updatePromotion'] = useCallback((id, updates) => {
    setPromotions((prev) => {
      const next = prev.map((p) => p.id === id ? { ...p, ...updates } : p);
      storage.savePromotions(next);
      return next;
    });
    addAuditEntry('update', 'promotion', id, 'تعديل عرض');
  }, [addAuditEntry]);

  const deletePromotion: AppData['deletePromotion'] = useCallback((id) => {
    setPromotions((prev) => { const next = prev.filter((p) => p.id !== id); storage.savePromotions(next); return next; });
    addAuditEntry('delete', 'promotion', id, 'حذف عرض');
  }, [addAuditEntry]);

  // ============ Stocktake ============
  const addStocktake: AppData['addStocktake'] = useCallback((items, staffId) => {
    const member = staff.find((s) => s.id === staffId);
    const stocktakeItems: Stocktake['items'] = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const expected = product?.stock ?? 0;
      return {
        productId: item.productId,
        productName: product?.name ?? '',
        expectedQty: expected,
        actualQty: item.actualQty,
        difference: item.actualQty - expected,
      };
    });
    const record: Stocktake = {
      id: storage.generateId(),
      items: stocktakeItems,
      staffId,
      staffName: member?.name ?? settings?.ownerName ?? 'المالك',
      createdAt: Date.now(),
    };
    setStocktakes((prev) => { const next = [record, ...prev]; storage.saveStocktakes(next); return next; });

    // Apply stock corrections
    setProducts((prev) => {
      const next = prev.map((p) => {
        const sti = stocktakeItems.find((i) => i.productId === p.id);
        if (sti && sti.difference !== 0) return { ...p, stock: sti.actualQty, updatedAt: Date.now() };
        return p;
      });
      storage.saveProducts(next);
      return next;
    });
    addAuditEntry('stocktake', 'stocktake', record.id, `جرد مخزون - ${items.length} صنف`);
    return record;
  }, [products, staff, settings, addAuditEntry]);

  const deleteStocktake: AppData['deleteStocktake'] = useCallback((id) => {
    setStocktakes((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveStocktakes(next); return next; });
  }, []);

  // ============ Attachments ============
  const addAttachment: AppData['addAttachment'] = useCallback((a) => {
    const att: Attachment = { ...a, id: storage.generateId(), createdAt: Date.now() };
    setAttachments((prev) => { const next = [att, ...prev]; storage.saveAttachments(next); return next; });
    return att;
  }, []);

  const deleteAttachment: AppData['deleteAttachment'] = useCallback((id) => {
    setAttachments((prev) => { const next = prev.filter((a) => a.id !== id); storage.saveAttachments(next); return next; });
  }, []);

  // ============ License ============
  const activateLicense: AppData['activateLicense'] = useCallback((key, plan) => {
    if (!license) return { success: false, message: 'لا يوجد ترخيص', newExpiry: null };
    const result = validateActivationKey(key, license.deviceFingerprint);
    if (!result.success || !result.newExpiry) return result;
    const durationDays = plan === 'monthly' ? 30 : plan === 'yearly' ? 365 : 36500;
    const newExpiry = plan === 'lifetime' ? Date.now() + 36500 * 86400000 : result.newExpiry;
    const updated = applyActivation(license, key, plan, newExpiry);
    setLicense(updated);
    storage.saveLicense(updated);
    addAuditEntry('login', 'license', '', `تفعيل اشتراك: ${plan}`);
    return { success: true, message: result.message, newExpiry };
  }, [license, addAuditEntry]);

  const refreshLicense: AppData['refreshLicense'] = useCallback(() => {
    if (!license) return;
    const evaluated = evaluateLicense(license);
    setLicense(evaluated);
    storage.saveLicense(evaluated);
  }, [license]);

  // ============ Telecom Companies ============
  const addTelecomCompany: AppData['addTelecomCompany'] = useCallback((c) => {
    const company: TelecomCompany = { ...c, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setTelecomCompanies((prev) => { const next = [...prev, company]; storage.saveTelecomCompanies(next); return next; });
    addAuditEntry('create', 'telecom_company', company.id, `إضافة شركة اتصال: ${company.name}`);
    return company;
  }, [addAuditEntry]);

  const updateTelecomCompany: AppData['updateTelecomCompany'] = useCallback((id, updates) => {
    setTelecomCompanies((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c);
      storage.saveTelecomCompanies(next);
      return next;
    });
    addAuditEntry('update', 'telecom_company', id, 'تعديل شركة اتصال');
  }, [addAuditEntry]);

  const deleteTelecomCompany: AppData['deleteTelecomCompany'] = useCallback((id) => {
    setTelecomCompanies((prev) => { const next = prev.filter((c) => c.id !== id); storage.saveTelecomCompanies(next); return next; });
    addAuditEntry('delete', 'telecom_company', id, 'حذف شركة اتصال');
  }, [addAuditEntry]);

  // ============ Sim Cards ============
  const addSimCard: AppData['addSimCard'] = useCallback((s) => {
    const sim: SimCard = { ...s, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setSimCards((prev) => { const next = [sim, ...prev]; storage.saveSimCards(next); return next; });
    addAuditEntry('create', 'sim_card', sim.id, `إضافة شريحة: ${sim.name}`);
    return sim;
  }, [addAuditEntry]);

  const updateSimCard: AppData['updateSimCard'] = useCallback((id, updates) => {
    setSimCards((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s);
      storage.saveSimCards(next);
      return next;
    });
    addAuditEntry('update', 'sim_card', id, 'تعديل شريحة');
  }, [addAuditEntry]);

  const deleteSimCard: AppData['deleteSimCard'] = useCallback((id) => {
    setSimCards((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveSimCards(next); return next; });
    addAuditEntry('delete', 'sim_card', id, 'حذف شريحة');
  }, [addAuditEntry]);

  // ============ Bundles ============
  const addBundle: AppData['addBundle'] = useCallback((b) => {
    const bundle: Bundle = { ...b, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setBundles((prev) => { const next = [bundle, ...prev]; storage.saveBundles(next); return next; });
    addAuditEntry('create', 'bundle', bundle.id, `إضافة حزمة: ${bundle.name}`);
    return bundle;
  }, [addAuditEntry]);

  const updateBundle: AppData['updateBundle'] = useCallback((id, updates) => {
    setBundles((prev) => {
      const next = prev.map((b) => b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b);
      storage.saveBundles(next);
      return next;
    });
    addAuditEntry('update', 'bundle', id, 'تعديل حزمة');
  }, [addAuditEntry]);

  const deleteBundle: AppData['deleteBundle'] = useCallback((id) => {
    setBundles((prev) => { const next = prev.filter((b) => b.id !== id); storage.saveBundles(next); return next; });
    addAuditEntry('delete', 'bundle', id, 'حذف حزمة');
  }, [addAuditEntry]);

  // ============ Sub Agents ============
  const addSubAgent: AppData['addSubAgent'] = useCallback((a) => {
    const agent: SubAgent = { ...a, balance: 0, rechargeEnabled: false, rechargeThreshold: 0, rechargeAmount: 0, supplierId: null, supplierPhone: '', scheduleEnabled: false, schedule: createDefaultSchedule(), id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setSubAgents((prev) => { const next = [agent, ...prev]; storage.saveSubAgents(next); return next; });
    addAuditEntry('create', 'sub_agent', agent.id, `إضافة شركة فرعية: ${agent.name}`);
    return agent;
  }, [addAuditEntry]);

  const updateSubAgent: AppData['updateSubAgent'] = useCallback((id, updates) => {
    setSubAgents((prev) => {
      const next = prev.map((a) => a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a);
      storage.saveSubAgents(next);
      return next;
    });
    addAuditEntry('update', 'sub_agent', id, 'تعديل شركة فرعية');
  }, [addAuditEntry]);

  const deleteSubAgent: AppData['deleteSubAgent'] = useCallback((id) => {
    setSubAgents((prev) => { const next = prev.filter((a) => a.id !== id); storage.saveSubAgents(next); return next; });
    addAuditEntry('delete', 'sub_agent', id, 'حذف شركة فرعية');
  }, [addAuditEntry]);

  const rechargeSubAgent: AppData['rechargeSubAgent'] = useCallback((id, amount) => {
    setSubAgents((prev) => {
      const next = prev.map((a) => a.id === id ? { ...a, balance: a.balance + amount, updatedAt: Date.now() } : a);
      storage.saveSubAgents(next);
      return next;
    });
    addAuditEntry('stock_adjust', 'sub_agent', id, `شحن رصيد شركة فرعية: ${amount}`);
  }, [addAuditEntry]);

  // ============ Telecom Sales ============
  const addTelecomSale: AppData['addTelecomSale'] = useCallback((s, createdAt) => {
    const customer = s.customerId ? customers.find((c) => c.id === s.customerId) : null;
    const balanceBefore = customer ? customer.balance : 0;
    const balanceAfter = balanceBefore;
    const sale: TelecomSale = { ...s, customerBalanceBefore: balanceBefore, customerBalanceAfter: balanceAfter, id: storage.generateId(), createdAt: createdAt ?? Date.now() };
    setTelecomSales((prev) => { const next = [sale, ...prev]; storage.saveTelecomSales(next); return next; });

    if (sale.mode === 'sell_sim' && sale.simId) {
      setSimCards((prev) => {
        const next = prev.map((s2) => s2.id === sale.simId ? { ...s2, stock: Math.max(0, s2.stock - 1), updatedAt: Date.now() } : s2);
        storage.saveSimCards(next);
        return next;
      });
    }

    if (sale.subAgentId) {
      setSubAgents((prev) => {
        const next = prev.map((a) => a.id === sale.subAgentId ? { ...a, balance: Math.max(0, a.balance - sale.cost), updatedAt: Date.now() } : a);
        storage.saveSubAgents(next);
        return next;
      });
    }

    if (sale.customerId && sale.debtChange !== 0) {
      setCustomers((prev) => {
        const next = prev.map((c) => c.id === sale.customerId ? { ...c, debt: Math.max(0, c.debt + sale.debtChange), updatedAt: Date.now() } : c);
        storage.saveCustomers(next);
        return next;
      });
    }

    addAuditEntry('sale', 'telecom_sale', sale.id, `بيع اتصالات: ${sale.simName} - ${sale.total}`);
    void publishSyncEvent(
      'telecom_sale',
      sale as unknown as Record<string, unknown>,
      sale.customerPhone || null,
      null,
    );
    if (sale.remaining > 0 && sale.customerPhone) {
      const transferMsg = settings?.autoReplyTemplates?.transferNumbersMessage?.trim() || null;
      if (transferMsg) {
        setTimeout(() => { void logOutboundSmsRef.current(sale.customerPhone, transferMsg, 'sms'); }, 3000);
      }
    }

    if (sale.operationType === 'activation' && sale.simNumber && sale.customerPhone) {
      const welcomeMsg = `أهلا وسهلا بكم في العبادله تيلكوم\nتم تفعيل الشريحه الخاصه بكم على الرقم : "${sale.simNumber}"\nفي حال تعرض للحظر  يرجى ارسال رقمك الى الرقم 0599991274 باللغه الانجليزيه دون أي اضافات.\nشكرا لثقتكم بنا`;
      setTimeout(() => { void logOutboundSmsRef.current(sale.customerPhone, welcomeMsg, 'sms'); }, 2000);
    }
    return sale;
  }, [addAuditEntry, settings]);

  const updateTelecomSale: AppData['updateTelecomSale'] = useCallback((id, updates) => {
    const oldSale = telecomSales.find((s) => s.id === id);
    const now = Date.now();

    // Reverse old debt from old customer, then apply new debt to new customer.
    if (oldSale && (updates.debtChange !== undefined || updates.customerId !== undefined || updates.remaining !== undefined || updates.paid !== undefined)) {
      const oldDebtChange = oldSale.debtChange ?? 0;
      const newDebtChange = updates.debtChange ?? oldDebtChange;
      const oldCustomerId = oldSale.customerId;
      const newCustomerId = updates.customerId ?? oldCustomerId;
      const oldOperationType = oldSale.operationType;
      const newOperationType = updates.operationType ?? oldOperationType;

      // Only adjust debt for non-cancelled sales
      if (oldOperationType !== 'cancelled' && newOperationType !== 'cancelled') {
        const reversal = oldCustomerId ? (oldDebtChange !== 0 ? -oldDebtChange : 0) : 0;
        const addition = newCustomerId ? (newDebtChange !== 0 ? newDebtChange : 0) : 0;

        setCustomers((prev) => {
          const next = prev.map((c) => {
            if (oldCustomerId && oldCustomerId === newCustomerId) {
              if (reversal === 0 && addition === 0) return c;
              return { ...c, debt: Math.max(0, c.debt + reversal + addition), updatedAt: now };
            }
            if (c.id === oldCustomerId && reversal !== 0) {
              return { ...c, debt: Math.max(0, c.debt + reversal), updatedAt: now };
            }
            if (c.id === newCustomerId && addition !== 0) {
              return { ...c, debt: Math.max(0, c.debt + addition), updatedAt: now };
            }
            return c;
          });
          storage.saveCustomers(next);
          return next;
        });
      }
    }

    setTelecomSales((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, ...updates } : s);
      storage.saveTelecomSales(next);
      return next;
    });
    addAuditEntry('update', 'telecom_sale', id, 'تعديل معاملة اتصالات');
  }, [telecomSales, addAuditEntry]);

  const deleteTelecomSale: AppData['deleteTelecomSale'] = useCallback((id) => {
    const sale = telecomSales.find((s) => s.id === id);
    setTelecomSales((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveTelecomSales(next); return next; });

    if (sale) {
      const customer = sale.customerId
        ? customers.find((c) => c.id === sale.customerId)
        : customers.find((c) => c.phone === sale.customerPhone || c.name === sale.customerName);
      const debtReversal = sale.operationType === 'cancelled' ? 0 : -(sale.remaining ?? sale.debtChange ?? 0);
      const balanceRefund = sale.paymentMethod === 'balance' ? sale.paid : 0;

      if (customer && (debtReversal !== 0 || balanceRefund > 0)) {
        setCustomers((prev) => {
          const next = prev.map((c) => c.id === customer.id ? {
            ...c,
            debt: Math.max(0, c.debt + debtReversal),
            balance: c.balance + balanceRefund,
            updatedAt: Date.now(),
          } : c);
          storage.saveCustomers(next);
          return next;
        });
      }
    }

    // Restore sub-agent balance
    if (sale && sale.subAgentId) {
      setSubAgents((prev) => {
        const next = prev.map((a) => a.id === sale.subAgentId ? { ...a, balance: a.balance + sale.cost, updatedAt: Date.now() } : a);
        storage.saveSubAgents(next);
        return next;
      });
    }

    // Restore sim stock if it was a sell_sim
    if (sale && sale.mode === 'sell_sim' && sale.simId) {
      setSimCards((prev) => {
        const next = prev.map((s2) => s2.id === sale.simId ? { ...s2, stock: s2.stock + 1, updatedAt: Date.now() } : s2);
        storage.saveSimCards(next);
        return next;
      });
    }

    addAuditEntry('delete', 'telecom_sale', id, `حذف معاملة اتصالات - ${sale?.customerName ?? ''}`);
  }, [telecomSales, customers, addAuditEntry]);

  const cancelTelecomSale: AppData['cancelTelecomSale'] = useCallback((id) => {
    const sale = telecomSales.find((s) => s.id === id);
    if (!sale || sale.operationType === 'cancelled') return;
    const now = Date.now();
    const dayMs = 86400000;
    const usageDays = Math.floor((now - sale.createdAt) / dayMs);
    const totalDays = sale.carryoverDays || 30;
    const remainingDays = Math.max(0, totalDays - usageDays);
    const isDebt = sale.paymentStatus === 'unpaid' || sale.remaining > 0;
    const deduction = sale.cancellationDeduction || 0;

    setTelecomSales((prev) => {
      const next = prev.map((s) => s.id === id ? {
        ...s,
        operationType: 'cancelled' as OperationType,
        cancelledAt: now,
        cancellationDeduction: deduction,
        notes: s.notes ? `${s.notes}\n[إلغاء: ${usageDays} يوم استخدام، ${remainingDays} يوم متبقي]` : `[إلغاء: ${usageDays} يوم استخدام، ${remainingDays} يوم متبقي]`,
      } : s);
      storage.saveTelecomSales(next);
      return next;
    });

    if (sale.customerId) {
      const customer = customers.find((c) => c.id === sale.customerId);
      if (customer) {
        if (isDebt) {
          // Debt case: calculate usage cost as new debt, remove old debt
          const usageCost = sale.salePrice * (usageDays / totalDays);
          const oldDebtReversal = -sale.debtChange;
          setCustomers((prev) => {
            const next = prev.map((c) => c.id === sale.customerId ? {
              ...c,
              debt: Math.max(0, c.debt + oldDebtReversal + usageCost),
              updatedAt: now,
            } : c);
            storage.saveCustomers(next);
            return next;
          });
        } else {
          // Paid case: deduct usage cost, refund remainder to balance
          const usageCost = sale.salePrice * (usageDays / totalDays);
          const refund = Math.max(0, sale.paid - usageCost);
          setCustomers((prev) => {
            const next = prev.map((c) => c.id === sale.customerId ? {
              ...c,
              balance: c.balance + refund,
              updatedAt: now,
            } : c);
            storage.saveCustomers(next);
            return next;
          });
        }
      }
    }

    // Restore sub-agent balance
    if (sale.subAgentId) {
      setSubAgents((prev) => {
        const next = prev.map((a) => a.id === sale.subAgentId ? { ...a, balance: a.balance + sale.cost, updatedAt: now } : a);
        storage.saveSubAgents(next);
        return next;
      });
    }

    // Restore sim stock if it was a sell_sim
    if (sale.mode === 'sell_sim' && sale.simId) {
      setSimCards((prev) => {
        const next = prev.map((s2) => s2.id === sale.simId ? { ...s2, stock: s2.stock + 1, updatedAt: now } : s2);
        storage.saveSimCards(next);
        return next;
      });
    }

    addAuditEntry('delete', 'telecom_sale', id, `إلغاء معاملة: ${sale.simName} - ${usageDays} يوم استخدام، ${remainingDays} يوم متبقي`);
  }, [telecomSales, customers, addAuditEntry]);

  const editTelecomSalePrice: AppData['editTelecomSalePrice'] = useCallback((id, newSalePrice) => {
    const sale = telecomSales.find((s) => s.id === id);
    if (!sale || newSalePrice <= 0) return;
    const oldPrice = sale.salePrice;
    const priceDiff = newSalePrice - oldPrice;
    const oldRemaining = Math.max(0, sale.remaining ?? sale.total - sale.paid);
    const newRemaining = Math.max(0, newSalePrice - sale.paid);
    const debtDiff = newRemaining - oldRemaining;
    const now = Date.now();

    setTelecomSales((prev) => {
      const next = prev.map((s) => s.id === id ? {
        ...s,
        salePrice: newSalePrice,
        total: newSalePrice,
        remaining: newRemaining,
        debtChange: (s.debtChange ?? 0) + debtDiff,
        customerBalanceAfter: (s.customerBalanceAfter ?? 0) + priceDiff,
      } : s);
      storage.saveTelecomSales(next);
      return next;
    });

    const customer = sale.customerId
      ? customers.find((c) => c.id === sale.customerId)
      : customers.find((c) => c.phone === sale.customerPhone || c.name === sale.customerName);
    if (customer && debtDiff !== 0) {
      setCustomers((prev) => {
        const next = prev.map((c) => c.id === customer.id ? {
          ...c,
          debt: Math.max(0, c.debt + debtDiff),
          updatedAt: now,
        } : c);
        storage.saveCustomers(next);
        return next;
      });
    }

    addAuditEntry('price_change', 'telecom_sale', id, `تعديل سعر: ${oldPrice} → ${newSalePrice} (فرق الدين ${debtDiff >= 0 ? '+' : ''}${debtDiff})`);
  }, [telecomSales, customers, addAuditEntry]);

  const collectTelecomSaleDebt: AppData['collectTelecomSaleDebt'] = useCallback((id, amount) => {
    const sale = telecomSales.find((s) => s.id === id);
    if (!sale || sale.remaining <= 0) return;
    const collectAmount = Math.min(amount, sale.remaining);
    const now = Date.now();

    setTelecomSales((prev) => {
      const next = prev.map((s) => s.id === id ? {
        ...s,
        paid: s.paid + collectAmount,
        remaining: Math.max(0, s.remaining - collectAmount),
        paymentStatus: s.remaining - collectAmount <= 0 ? 'paid_full' as PaymentStatus : 'paid_partial' as PaymentStatus,
        customerBalanceAfter: (s.customerBalanceAfter ?? 0) - collectAmount,
      } : s);
      storage.saveTelecomSales(next);
      return next;
    });

    // Reduce customer debt
    if (sale.customerId) {
      setCustomers((prev) => {
        const next = prev.map((c) => c.id === sale.customerId ? {
          ...c,
          debt: Math.max(0, c.debt - collectAmount),
          updatedAt: now,
        } : c);
        storage.saveCustomers(next);
        return next;
      });
    }

    addAuditEntry('payment', 'telecom_sale', id, `تحصيل دين معاملة: ${collectAmount} - ${sale.customerName}`);
  }, [telecomSales, addAuditEntry]);

  const checkAutoRenewals: AppData['checkAutoRenewals'] = useCallback(() => {
    const now = Date.now();
    const dayMs = 86400000;
    setTelecomSales((prev) => {
      const toRenew = prev.filter((s) => s.autoRenew && !s.renewedFromId && (now - s.createdAt) >= 30 * dayMs);
      if (toRenew.length === 0) return prev;
      const renewed: TelecomSale[] = toRenew.map((s) => ({
        ...s,
        id: storage.generateId(),
        createdAt: now,
        renewedFromId: s.id,
        paid: 0,
        remaining: s.total,
        debtChange: s.customerId ? s.total : 0,
        smsSent: false,
      }));
      const updated = toRenew.map((s) => ({ ...s, autoRenew: false }));
      const next = [...renewed, ...prev.map((s) => {
        const renewedOrig = updated.find((u) => u.id === s.id);
        return renewedOrig ?? s;
      })];
      storage.saveTelecomSales(next);
      renewed.forEach((r) => {
        addAuditEntry('sale', 'telecom_sale', r.id, `تجديد تلقائي: ${r.simName} - ${r.customerName}`);
      });
      return next;
    });
  }, [addAuditEntry]);

  // ============ Debt Reminders ============
  const addDebtReminder: AppData['addDebtReminder'] = useCallback((r) => {
    const now = Date.now();
    const reminder: DebtReminderSchedule = {
      ...r, id: storage.generateId(), createdAt: now, lastSent: null,
      nextSend: now + (r.frequency === 'daily' ? 86400000 : r.frequency === 'weekly' ? 7 * 86400000 : r.frequency === 'every_3_days' ? 3 * 86400000 : r.frequency === 'every_5_days' ? 5 * 86400000 : (r.customDays || 1) * 86400000),
    };
    setDebtReminders((prev) => { const next = [...prev, reminder]; storage.saveDebtReminders(next); return next; });
    return reminder;
  }, []);

  const updateDebtReminder: AppData['updateDebtReminder'] = useCallback((id, updates) => {
    setDebtReminders((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, ...updates } : r);
      storage.saveDebtReminders(next);
      return next;
    });
  }, []);

  const deleteDebtReminder: AppData['deleteDebtReminder'] = useCallback((id) => {
    setDebtReminders((prev) => { const next = prev.filter((r) => r.id !== id); storage.saveDebtReminders(next); return next; });
  }, []);

  const checkAndSendReminders: AppData['checkAndSendReminders'] = useCallback(() => {
    const now = Date.now();
    setDebtReminders((prev) => {
      const next = prev.map((r) => {
        if (r.active && r.nextSend && now >= r.nextSend) {
          if (r.customerPhone && r.message) {
            void logOutboundSmsRef.current(r.customerPhone, r.message, 'sms');
          }
          return { ...r, lastSent: now, nextSend: now + (r.frequency === 'daily' ? 86400000 : r.frequency === 'weekly' ? 7 * 86400000 : r.frequency === 'every_3_days' ? 3 * 86400000 : r.frequency === 'every_5_days' ? 5 * 86400000 : (r.customDays || 1) * 86400000) };
        }
        return r;
      });
      storage.saveDebtReminders(next);
      return next;
    });
  }, []);

  // ============ Agent Bundles ============
  const addAgentBundle: AppData['addAgentBundle'] = useCallback((b) => {
    const bundle: AgentBundle = { ...b, bundleType: b.bundleType ?? 'monthly', id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setAgentBundles((prev) => { const next = [bundle, ...prev]; storage.saveAgentBundles(next); return next; });
    addAuditEntry('create', 'agent_bundle', bundle.id, `إضافة حزمة وكيل: ${bundle.bundleName}`);
    return bundle;
  }, [addAuditEntry]);

  const updateAgentBundle: AppData['updateAgentBundle'] = useCallback((id, updates) => {
    setAgentBundles((prev) => {
      const next = prev.map((b) => b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b);
      storage.saveAgentBundles(next);
      return next;
    });
    addAuditEntry('update', 'agent_bundle', id, 'تعديل حزمة وكيل');
  }, [addAuditEntry]);

  const deleteAgentBundle: AppData['deleteAgentBundle'] = useCallback((id) => {
    setAgentBundles((prev) => { const next = prev.filter((b) => b.id !== id); storage.saveAgentBundles(next); return next; });
    addAuditEntry('delete', 'agent_bundle', id, 'حذف حزمة وكيل');
  }, [addAuditEntry]);

  // ============ Sim Locations ============
  const addSimLocation: AppData['addSimLocation'] = useCallback((l) => {
    const loc: SimLocation = { ...l, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setSimLocations((prev) => { const next = [loc, ...prev]; storage.saveSimLocations(next); return next; });
    addAuditEntry('create', 'sim_location', loc.id, `إضافة نقطة: ${loc.name}`);
    return loc;
  }, [addAuditEntry]);

  const updateSimLocation: AppData['updateSimLocation'] = useCallback((id, updates) => {
    setSimLocations((prev) => {
      const next = prev.map((l) => l.id === id ? { ...l, ...updates, updatedAt: Date.now() } : l);
      storage.saveSimLocations(next);
      return next;
    });
    addAuditEntry('update', 'sim_location', id, 'تعديل نقطة');
  }, [addAuditEntry]);

  const deleteSimLocation: AppData['deleteSimLocation'] = useCallback((id) => {
    setSimLocations((prev) => { const next = prev.filter((l) => l.id !== id); storage.saveSimLocations(next); return next; });
    setSimLocationStock((prev) => { const next = prev.filter((s) => s.locationId !== id); storage.saveSimLocationStock(next); return next; });
    addAuditEntry('delete', 'sim_location', id, 'حذف نقطة');
  }, [addAuditEntry]);

  const addSimLocationStock: AppData['addSimLocationStock'] = useCallback((s) => {
    const stock: SimLocationStock = { ...s, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setSimLocationStock((prev) => { const next = [stock, ...prev]; storage.saveSimLocationStock(next); return next; });
    return stock;
  }, []);

  const updateSimLocationStock: AppData['updateSimLocationStock'] = useCallback((id, updates) => {
    setSimLocationStock((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s);
      storage.saveSimLocationStock(next);
      return next;
    });
  }, []);

  const deleteSimLocationStock: AppData['deleteSimLocationStock'] = useCallback((id) => {
    setSimLocationStock((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveSimLocationStock(next); return next; });
  }, []);

  // ============ Telecom Suppliers ============
  const addTelecomSupplier: AppData['addTelecomSupplier'] = useCallback((s) => {
    const supplier: TelecomSupplier = { ...s, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setTelecomSuppliers((prev) => { const next = [supplier, ...prev]; storage.saveTelecomSuppliers(next); return next; });
    addAuditEntry('create', 'telecom_supplier', supplier.id, `إضافة مورد اتصالات: ${supplier.name}`);
    return supplier;
  }, [addAuditEntry]);

  const updateTelecomSupplier: AppData['updateTelecomSupplier'] = useCallback((id, updates) => {
    setTelecomSuppliers((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s);
      storage.saveTelecomSuppliers(next);
      return next;
    });
    addAuditEntry('update', 'telecom_supplier', id, 'تعديل مورد اتصالات');
  }, [addAuditEntry]);

  const deleteTelecomSupplier: AppData['deleteTelecomSupplier'] = useCallback((id) => {
    setTelecomSuppliers((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveTelecomSuppliers(next); return next; });
    addAuditEntry('delete', 'telecom_supplier', id, 'حذف مورد اتصالات');
  }, [addAuditEntry]);

  // ============ Shipments ============
  const addShipment: AppData['addShipment'] = useCallback((s) => {
    const shipment: Shipment = { ...s, id: storage.generateId(), createdAt: Date.now() };
    setShipments((prev) => { const next = [shipment, ...prev]; storage.saveShipments(next); return next; });
    if (shipment.subAgentId) {
      setSubAgents((prev) => {
        const next = prev.map((a) => a.id === shipment.subAgentId ? { ...a, balance: a.balance + shipment.amount, updatedAt: Date.now() } : a);
        storage.saveSubAgents(next);
        return next;
      });
    }
    if (shipment.supplierId) {
      setSuppliers((prev) => {
        const next = prev.map((sp) => sp.id === shipment.supplierId ? { ...sp, balance: sp.balance + shipment.amount, updatedAt: Date.now() } : sp);
        storage.saveSuppliers(next);
        return next;
      });
    }
    addAuditEntry('stock_adjust', 'shipment', shipment.id, `شحنة من ${shipment.supplierName} إلى ${shipment.subAgentName} بقيمة ${shipment.amount}`);
    return shipment;
  }, [addAuditEntry]);

  const deleteShipment: AppData['deleteShipment'] = useCallback((id) => {
    const shipment = shipments.find((s) => s.id === id);
    if (shipment && shipment.subAgentId) {
      setSubAgents((prev) => {
        const next = prev.map((a) => a.id === shipment.subAgentId ? { ...a, balance: Math.max(0, a.balance - shipment.amount), updatedAt: Date.now() } : a);
        storage.saveSubAgents(next);
        return next;
      });
    }
    if (shipment && shipment.supplierId) {
      setSuppliers((prev) => {
        const next = prev.map((sp) => sp.id === shipment.supplierId ? { ...sp, balance: Math.max(0, sp.balance - shipment.amount), updatedAt: Date.now() } : sp);
        storage.saveSuppliers(next);
        return next;
      });
    }
    setShipments((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveShipments(next); return next; });
  }, [shipments]);

  // ============ Recharge Requests ============
  const addRechargeRequest: AppData['addRechargeRequest'] = useCallback((r) => {
    const req: RechargeRequest = { ...r, id: storage.generateId(), createdAt: Date.now() };
    setRechargeRequests((prev) => { const next = [req, ...prev]; storage.saveRechargeRequests(next); return next; });
    addAuditEntry('create', 'recharge_request', req.id, `طلب شحن: ${req.subAgentName} - ${req.amount}`);
    return req;
  }, [addAuditEntry]);

  const updateRechargeRequest: AppData['updateRechargeRequest'] = useCallback((id, updates) => {
    setRechargeRequests((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, ...updates } : r);
      storage.saveRechargeRequests(next);
      return next;
    });
  }, []);

  const deleteRechargeRequest: AppData['deleteRechargeRequest'] = useCallback((id) => {
    setRechargeRequests((prev) => { const next = prev.filter((r) => r.id !== id); storage.saveRechargeRequests(next); return next; });
  }, []);

  const confirmRechargeRequest: AppData['confirmRechargeRequest'] = useCallback((id) => {
    const req = rechargeRequests.find((r) => r.id === id);
    if (!req || req.status === 'confirmed') return;
    const now = Date.now();
    setRechargeRequests((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, status: 'confirmed' as RechargeRequestStatus, confirmedAt: now } : r);
      storage.saveRechargeRequests(next);
      return next;
    });
    if (req.subAgentId) {
      setSubAgents((prev) => {
        const next = prev.map((a) => a.id === req.subAgentId ? { ...a, balance: a.balance + req.amount, updatedAt: now } : a);
        storage.saveSubAgents(next);
        return next;
      });
    }
    if (req.supplierId) {
      const shipment: Shipment = {
        id: storage.generateId(),
        supplierId: req.supplierId,
        supplierName: req.supplierName,
        subAgentId: req.subAgentId,
        subAgentName: req.subAgentName,
        amount: req.amount,
        notes: `شحن تلقائي من طلب شحن`,
        createdAt: now,
      };
      setShipments((prev) => { const next = [shipment, ...prev]; storage.saveShipments(next); return next; });
      setSuppliers((prev) => {
        const next = prev.map((sp) => sp.id === req.supplierId ? { ...sp, balance: sp.balance + req.amount, updatedAt: now } : sp);
        storage.saveSuppliers(next);
        return next;
      });
    }
    addAuditEntry('stock_adjust', 'recharge_request', id, `تأكيد شحن: ${req.subAgentName} - ${req.amount} (دين للمورد ${req.supplierName})`);
    if (req.supplierPhone) {
      const thankYouMsg = `عزيزي ${req.supplierName}،\nنشكرك على تنفيذ طلب الشحن للوكيل ${req.subAgentName} بمبلغ ${req.amount.toFixed(2)}. تم استلام الشحن بنجاح. شكراً لتعاونك معنا`;
      void logOutboundSmsRef.current(req.supplierPhone, thankYouMsg, 'sms');
    }
  }, [rechargeRequests, addAuditEntry]);

  const checkRechargeAlerts: AppData['checkRechargeAlerts'] = useCallback(() => {
    const now = Date.now();
    const existingPending = new Set(rechargeRequests.filter((r) => r.status === 'pending' || r.status === 'sent').map((r) => r.subAgentId));
    const toCreate: RechargeRequest[] = [];
    for (const agent of subAgents) {
      if (!agent.rechargeEnabled || !agent.active) continue;
      if (agent.balance > agent.rechargeThreshold) continue;
      if (existingPending.has(agent.id)) continue;
      if (!agent.supplierPhone) continue;
      const supplier = agent.supplierId ? suppliers.find((s) => s.id === agent.supplierId) : null;
      const amount = agent.rechargeAmount > 0 ? agent.rechargeAmount : 100;
      const msg = `مرحباً ${supplier?.name ?? ''},\nالوكيل ${agent.name} وصل رصيده إلى ${agent.balance.toFixed(2)}.\nنرجو شحن الوكالة بمبلغ ${amount.toFixed(2)}.\nشكراً لكم`;
      toCreate.push({
        id: storage.generateId(),
        subAgentId: agent.id,
        subAgentName: agent.name,
        supplierId: agent.supplierId,
        supplierName: supplier?.name ?? '',
        supplierPhone: agent.supplierPhone,
        amount,
        message: msg,
        status: 'pending' as RechargeRequestStatus,
        smsSent: false,
        whatsappSent: false,
        createdAt: now,
        sentAt: null,
        confirmedAt: null,
      });
    }
    if (toCreate.length > 0) {
      setRechargeRequests((prev) => { const next = [...toCreate, ...prev]; storage.saveRechargeRequests(next); return next; });
      toCreate.forEach((r) => {
        addAuditEntry('create', 'recharge_request', r.id, `طلب شحن تلقائي: ${r.subAgentName} - ${r.amount}`);
        if (r.supplierPhone && isSupplierWorkHours({})) {
          void logOutboundSmsRef.current(r.supplierPhone, r.message, 'sms');
        }
      });
    }
  }, [subAgents, rechargeRequests, suppliers, addAuditEntry]);

  const checkRechargeRef = useRef(checkRechargeAlerts);
  checkRechargeRef.current = checkRechargeAlerts;
  useEffect(() => {
    if (loaded) checkRechargeRef.current();
  }, [subAgents, loaded]);



  // ============ Business Hours ============
  const updateBusinessHours: AppData['updateBusinessHours'] = useCallback((updates) => {
    setBusinessHours((prev) => {
      const base = prev ?? DEFAULT_BUSINESS_HOURS;
      const next = { ...base, ...updates };
      storage.saveBusinessHours(next);
      return next;
    });
  }, []);

  // ============ Keyword Replies ============
  const addKeywordReply: AppData['addKeywordReply'] = useCallback((r) => {
    const reply: KeywordReply = { ...r, id: storage.generateId(), createdAt: Date.now() };
    setKeywordReplies((prev) => { const next = [reply, ...prev]; storage.saveKeywordReplies(next); return next; });
    return reply;
  }, []);

  const updateKeywordReply: AppData['updateKeywordReply'] = useCallback((id, updates) => {
    setKeywordReplies((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, ...updates } : r);
      storage.saveKeywordReplies(next);
      return next;
    });
  }, []);

  const deleteKeywordReply: AppData['deleteKeywordReply'] = useCallback((id) => {
    setKeywordReplies((prev) => { const next = prev.filter((r) => r.id !== id); storage.saveKeywordReplies(next); return next; });
  }, []);

  // ============ Pending Operations ============
  const addPendingOperation: AppData['addPendingOperation'] = useCallback((op) => {
    const pending: PendingOperation = { ...op, id: storage.generateId(), createdAt: Date.now(), status: 'pending' as const, executedAt: null };
    setPendingOperations((prev) => { const next = [pending, ...prev]; storage.savePendingOperations(next); return next; });
    return pending;
  }, []);

  const updatePendingOperation: AppData['updatePendingOperation'] = useCallback((id, updates) => {
    setPendingOperations((prev) => {
      const next = prev.map((o) => o.id === id ? { ...o, ...updates } : o);
      storage.savePendingOperations(next);
      return next;
    });
  }, []);

  const deletePendingOperation: AppData['deletePendingOperation'] = useCallback((id) => {
    setPendingOperations((prev) => { const next = prev.filter((o) => o.id !== id); storage.savePendingOperations(next); return next; });
  }, []);

  const executePendingOperation: AppData['executePendingOperation'] = useCallback((id) => {
    setPendingOperations((prev) => {
      const next = prev.map((o) => o.id === id ? { ...o, status: 'executed' as const, executedAt: Date.now() } : o);
      storage.savePendingOperations(next);
      return next;
    });
  }, []);

  // ============ Debt Escalation ============
  const processEscalationReply: AppData['processEscalationReply'] = useCallback((saleId, replyText) => {
    setTelecomSales((prev) => {
      const next = prev.map((s) => {
        if (s.id !== saleId || !s.escalationState) return s;
        const result = processCustomerReply(s.escalationState, replyText);
        if (result.messageToSend && s.customerPhone) {
          void logOutboundSmsRef.current(s.customerPhone, result.messageToSend, 'sms');
        }
        if (result.createFreezeRequest) {
          const fr = createFreezeRequestFromState(result.newState, storage.generateId);
          setFreezeRequests((prevFR) => { const nextFR = [fr, ...prevFR]; storage.saveFreezeRequests(nextFR); return nextFR; });
        }
        if (result.createPendingOp) {
          const op: PendingOperation = {
            id: storage.generateId(),
            source: 'sms' as const,
            senderPhone: s.customerPhone,
            senderName: s.customerName,
            simNumber: s.simNumber,
            originalMessage: replyText,
            status: 'pending' as const,
            customerMatched: !!s.customerId,
            customerId: s.customerId,
            customerName: s.customerName,
            customerPhone: s.customerPhone,
            companyGuess: s.companyId,
            bundleGuess: s.bundleName,
            createdAt: Date.now(),
            executedAt: null,
            transferReportId: null,
            transferNotificationId: null,
            transferStatus: 'none' as const,
            chargeDuration: null,
            companyName: s.companyName,
          };
          setPendingOperations((prevOP) => { const nextOP = [op, ...prevOP]; storage.savePendingOperations(nextOP); return nextOP; });
        }
        return { ...s, escalationState: result.newState };
      });
      storage.saveTelecomSales(next);
      return next;
    });
  }, []);

  const checkEscalationReminders: AppData['checkEscalationReminders'] = useCallback(() => {
    const now = Date.now();
    setTelecomSales((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        if (!s.escalationState) return s;
        const st = s.escalationState;
        if (st.phase === 'frozen' || st.phase === 'reactivated' || st.phase === 'freeze_pending') return s;
        if (st.phase === 'awaiting_reply' && st.customerReplyDate && st.customerReplyDate > now) return s;
        if (st.nextReminderAt === null || st.nextReminderAt > now) return s;
        const result = processReminderTick(st, settings?.currency ?? '₪');
        if (result.messageToSend && s.customerPhone) {
          void logOutboundSmsRef.current(s.customerPhone, result.messageToSend, 'sms');
        }
        if (result.newState.phase === 'freeze_pending') {
          const fr = createFreezeRequestFromState(result.newState, storage.generateId);
          setFreezeRequests((prevFR) => { const nextFR = [fr, ...prevFR]; storage.saveFreezeRequests(nextFR); return nextFR; });
        }
        changed = true;
        return { ...s, escalationState: result.newState };
      });
      if (changed) storage.saveTelecomSales(next);
      return next;
    });
  }, [settings]);

  const executeFreezeRequest: AppData['executeFreezeRequest'] = useCallback((id) => {
    setFreezeRequests((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, status: 'executed' as const, executedAt: Date.now() } : r);
      storage.saveFreezeRequests(next);
      return next;
    });
    const req = freezeRequests.find((r) => r.id === id);
    if (req) {
      setTelecomSales((prev) => {
        const next = prev.map((s) => {
          if (s.id !== req.saleId || !s.escalationState) return s;
          return { ...s, escalationState: executeFreeze(s.escalationState) };
        });
        storage.saveTelecomSales(next);
        return next;
      });
      addAuditEntry('update', 'telecom_sale', req.saleId, 'تجميد اشتراك: ' + req.customerName + ' - ' + req.simNumber);
    }
  }, [freezeRequests, addAuditEntry]);

  const cancelFreezeRequest: AppData['cancelFreezeRequest'] = useCallback((id) => {
    setFreezeRequests((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, status: 'cancelled' as const } : r);
      storage.saveFreezeRequests(next);
      return next;
    });
  }, []);

  const reactivateSale: AppData['reactivateSale'] = useCallback((saleId, reason) => {
    setTelecomSales((prev) => {
      const next = prev.map((s) => {
        if (s.id !== saleId || !s.escalationState) return s;
        const newState = reactivateFromPaymentOrPromise(s.escalationState, reason);
        if (s.customerPhone) {
          const msg = buildReactivationMessage(s.customerName, reason);
          void logOutboundSmsRef.current(s.customerPhone, msg, 'sms');
        }
        return { ...s, escalationState: newState };
      });
      storage.saveTelecomSales(next);
      return next;
    });
    addAuditEntry('update', 'telecom_sale', saleId, 'إعادة تفعيل: ' + reason);
  }, [addAuditEntry]);

  const checkEscalationRef = useRef(checkEscalationReminders);
  checkEscalationRef.current = checkEscalationReminders;

  const telecomSalesRef = useRef(telecomSales);
  telecomSalesRef.current = telecomSales;

  const processEscalationReplyRef = useRef(processEscalationReply);
  processEscalationReplyRef.current = processEscalationReply;

  const telecomCompaniesRef = useRef(telecomCompanies);
  telecomCompaniesRef.current = telecomCompanies;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const supportTicketsRef = useRef(supportTickets);
  supportTicketsRef.current = supportTickets;

  const subAgentsRef = useRef(subAgents);
  subAgentsRef.current = subAgents;

  const suppliersRef = useRef(suppliers);
  suppliersRef.current = suppliers;

  const keywordRepliesRef = useRef(keywordReplies);
  keywordRepliesRef.current = keywordReplies;

  const bundlesRef = useRef(bundles);
  bundlesRef.current = bundles;

  const agentBundlesRef = useRef(agentBundles);
  agentBundlesRef.current = agentBundles;

  const unrecognizedMessagesRef = useRef(unrecognizedMessages);
  unrecognizedMessagesRef.current = unrecognizedMessages;

  const businessHoursRef = useRef(businessHours);
  businessHoursRef.current = businessHours;

  const transferNotificationsRef = useRef(transferNotifications);
  transferNotificationsRef.current = transferNotifications;

  const nameMappingsRef = useRef(nameMappings);
  nameMappingsRef.current = nameMappings;

  const pendingOperationsRef = useRef(pendingOperations);
  pendingOperationsRef.current = pendingOperations;

  const customersRef = useRef(customers);
  customersRef.current = customers;


  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => checkEscalationRef.current(), 60000);
    return () => clearInterval(interval);
  }, [loaded]);

  // ============ Support Tickets ============
  const addSupportTicket: AppData['addSupportTicket'] = useCallback((t) => {
    const ticket: SupportTicket = { ...t, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setSupportTickets((prev) => { const next = [ticket, ...prev]; storage.saveSupportTickets(next); return next; });
    addAuditEntry('create', 'support_ticket', ticket.id, 'طلب دعم فني: ' + ticket.simNumber);
    return ticket;
  }, [addAuditEntry]);

  const updateSupportTicket: AppData['updateSupportTicket'] = useCallback((id, updates) => {
    setSupportTickets((prev) => {
      const next = prev.map((t) => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t);
      storage.saveSupportTickets(next);
      return next;
    });
  }, []);

  const deleteSupportTicket: AppData['deleteSupportTicket'] = useCallback((id) => {
    setSupportTickets((prev) => { const next = prev.filter((t) => t.id !== id); storage.saveSupportTickets(next); return next; });
  }, []);

  const forwardSupportReply: AppData['forwardSupportReply'] = useCallback((ticketId, replyText) => {
    setSupportTickets((prev) => {
      const ticket = prev.find((t) => t.id === ticketId);
      if (ticket) {
        void logOutboundSmsRef.current(ticket.customerPhone, replyText, 'sms');
      }
      const next = prev.map((t) => t.id === ticketId ? { ...t, status: 'replied' as const, customerReplySent: replyText, updatedAt: Date.now() } : t);
      storage.saveSupportTickets(next);
      return next;
    });
    addAuditEntry('update', 'support_ticket', ticketId, 'إرسال رد الدعم الفني للزبون');
    const ticket = supportTickets.find((t) => t.id === ticketId);
    if (ticket?.companySupportPhone) {
      void logOutboundSmsRef.current(ticket.companySupportPhone, `شكراً لكم على تنفيذ طلبنا. تم توجيه ردكم للزبون بنجاح. نقدر تعاونكم`, 'whatsapp');
    }
  }, [addAuditEntry, supportTickets]);

  const confirmRechargeBySupport: AppData['confirmRechargeBySupport'] = useCallback((ticketId, replyText) => {
    const templates = settings?.autoReplyTemplates ?? null;
    const transferMsg = templates?.transferNumbersMessage?.trim() || null;
    setSupportTickets((prev) => {
      const ticket = prev.find((t) => t.id === ticketId);
      if (ticket) {
        const msg = replyText.trim() || buildRechargeConfirmedMessage(ticket.simNumber, templates);
        void logOutboundSmsRef.current(ticket.customerPhone, msg, 'sms');
        if (transferMsg) {
          setTimeout(() => { void logOutboundSmsRef.current(ticket.customerPhone, transferMsg, 'sms'); }, 3000);
        }
      }
      const next = prev.map((t) => t.id === ticketId ? { ...t, status: 'recharged_by_support' as const, customerReplySent: replyText || buildRechargeConfirmedMessage(t.simNumber, templates), rechargeConfirmedAt: Date.now(), updatedAt: Date.now() } : t);
      storage.saveSupportTickets(next);
      return next;
    });
    addAuditEntry('update', 'support_ticket', ticketId, 'تأكيد شحن الرقم من الدعم الفني');
    const ticket2 = supportTickets.find((t) => t.id === ticketId);
    if (ticket2?.companySupportPhone) {
      void logOutboundSmsRef.current(ticket2.companySupportPhone, `شكراً لكم على تنفيذ شحن الرقم ${ticket2.simNumber}. نقدر سرعة استجابتكم وتعاونكم`, 'whatsapp');
    }
  }, [addAuditEntry, settings, supportTickets]);

  // ============ Unrecognized Messages (self-learning) ============
  const learnFromMessage: AppData['learnFromMessage'] = useCallback((id, reply, keywords) => {
    const trimmedReply = reply.trim();
    const trimmedKeywords = keywords.map((k) => k.trim()).filter(Boolean);
    if (!trimmedReply || trimmedKeywords.length === 0) return;

    const msg = unrecognizedMessages.find((m) => m.id === id);
    if (!msg) return;

    // Create a new keyword reply rule
    const kr: KeywordReply = {
      id: storage.generateId(),
      keywords: trimmedKeywords,
      reply: trimmedReply,
      active: true,
      createdAt: Date.now(),
    };
    setKeywordReplies((prev) => { const next = [kr, ...prev]; storage.saveKeywordReplies(next); return next; });

    // Send the reply to the customer now
    void logOutboundSmsRef.current(msg.senderPhone, trimmedReply, 'sms');

    // Mark the unrecognized message as learned
    setUnrecognizedMessages((prev) => {
      const next = prev.map((m) => m.id === id ? { ...m, status: 'learned' as const, learnedReply: trimmedReply, learnedKeywords: trimmedKeywords, resolvedAt: Date.now() } : m);
      storage.saveUnrecognizedMessages(next);
      return next;
    });
    addAuditEntry('update', 'unrecognized_message', id, `تعليم رد تلقائي للكلمات: ${trimmedKeywords.join(', ')}`);
  }, [unrecognizedMessages, addAuditEntry]);

  const ignoreUnrecognizedMessage: AppData['ignoreUnrecognizedMessage'] = useCallback((id) => {
    setUnrecognizedMessages((prev) => {
      const next = prev.map((m) => m.id === id ? { ...m, status: 'ignored' as const, resolvedAt: Date.now() } : m);
      storage.saveUnrecognizedMessages(next);
      return next;
    });
  }, []);

  const deleteUnrecognizedMessage: AppData['deleteUnrecognizedMessage'] = useCallback((id) => {
    setUnrecognizedMessages((prev) => { const next = prev.filter((m) => m.id !== id); storage.saveUnrecognizedMessages(next); return next; });
  }, []);

  // ============ Transfer Notifications ============
  const addTransferNotification: AppData['addTransferNotification'] = useCallback((tn) => {
    const notification: TransferNotification = { ...tn, id: storage.generateId(), createdAt: Date.now() };
    setTransferNotifications((prev) => { const next = [notification, ...prev]; storage.saveTransferNotifications(next); return next; });
    return notification;
  }, []);

  const updateTransferNotification: AppData['updateTransferNotification'] = useCallback((id, updates) => {
    setTransferNotifications((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, ...updates } : n);
      storage.saveTransferNotifications(next);
      return next;
    });
  }, []);

  const deleteTransferNotification: AppData['deleteTransferNotification'] = useCallback((id) => {
    setTransferNotifications((prev) => { const next = prev.filter((n) => n.id !== id); storage.saveTransferNotifications(next); return next; });
  }, []);

  const confirmTransferNotification: AppData['confirmTransferNotification'] = useCallback((id, pendingOpId, saleId) => {
    setTransferNotifications((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, status: 'confirmed' as TransferNotificationStatus, matchedPendingOpId: pendingOpId, matchedSaleId: saleId, confirmedAt: Date.now(), confirmedBy: currentStaff?.name || settings?.ownerName || 'المالك' } : n);
      storage.saveTransferNotifications(next);
      return next;
    });
    if (pendingOpId) {
      setPendingOperations((prev) => {
        const next = prev.map((op) => op.id === pendingOpId ? { ...op, transferNotificationId: id, transferStatus: 'confirmed' as const } : op);
        storage.savePendingOperations(next);
        return next;
      });
    }
    addAuditEntry('update', 'transfer_notification', id, 'تأكيد إشعار تحويل');
  }, [addAuditEntry, currentStaff, settings]);

  const rejectTransferNotification: AppData['rejectTransferNotification'] = useCallback((id, reason) => {
    setTransferNotifications((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, status: 'rejected' as TransferNotificationStatus, rejectedReason: reason } : n);
      storage.saveTransferNotifications(next);
      return next;
    });
    addAuditEntry('update', 'transfer_notification', id, 'رفض إشعار تحويل: ' + reason);
  }, [addAuditEntry]);

  // ============ Transfer Reports ============
  const addTransferReport: AppData['addTransferReport'] = useCallback((tr) => {
    const report: TransferReport = { ...tr, id: storage.generateId(), createdAt: Date.now() };
    setTransferReports((prev) => { const next = [report, ...prev]; storage.saveTransferReports(next); return next; });
    return report;
  }, []);

  const updateTransferReport: AppData['updateTransferReport'] = useCallback((id, updates) => {
    setTransferReports((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, ...updates } : r);
      storage.saveTransferReports(next);
      return next;
    });
  }, []);

  const deleteTransferReport: AppData['deleteTransferReport'] = useCallback((id) => {
    setTransferReports((prev) => { const next = prev.filter((r) => r.id !== id); storage.saveTransferReports(next); return next; });
  }, []);

  // ============ Name Mappings (self-learning) ============
  const addNameMapping: AppData['addNameMapping'] = useCallback((fromName, toCustomerId, toCustomerName, toCustomerPhone) => {
    const normalized = normalizeName(fromName);
    setNameMappings((prev) => {
      const existing = prev.find((m) => m.fromNameNormalized === normalized && m.toCustomerId === toCustomerId);
      if (existing) {
        const next = prev.map((m) => m.id === existing.id ? { ...m, confirmedCount: m.confirmedCount + 1, updatedAt: Date.now() } : m);
        storage.saveNameMappings(next);
        return next;
      }
      const mapping: NameMapping = {
        id: storage.generateId(),
        fromName,
        fromNameNormalized: normalized,
        toCustomerId,
        toCustomerName,
        toCustomerPhone,
        confirmedCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const next = [mapping, ...prev];
      storage.saveNameMappings(next);
      return next;
    });
  }, []);

  const deleteNameMapping: AppData['deleteNameMapping'] = useCallback((id) => {
    setNameMappings((prev) => { const next = prev.filter((m) => m.id !== id); storage.saveNameMappings(next); return next; });
  }, []);

  // Link a transfer notification to a pending operation / sale — self-learning
  const linkTransferNotification: AppData['linkTransferNotification'] = useCallback((notificationId, pendingOpId, saleId, customerId) => {
    setTransferNotifications((prev) => {
      const notification = prev.find((n) => n.id === notificationId);
      if (notification) {
        // Self-learning: create a name mapping from this manual link
        if (notification.senderName && customerId) {
          const customer = customersRef.current.find((c) => c.id === customerId);
          if (customer) {
            addNameMapping(notification.senderName, customerId, customer.name, customer.phone);
          }
        }
      }
      const next = prev.map((n) => n.id === notificationId ? {
        ...n,
        status: 'matched' as TransferNotificationStatus,
        matchedPendingOpId: pendingOpId,
        matchedSaleId: saleId,
        matchedCustomerId: customerId,
      } : n);
      storage.saveTransferNotifications(next);
      return next;
    });
    if (pendingOpId) {
      setPendingOperations((prev) => {
        const next = prev.map((op) => op.id === pendingOpId ? { ...op, transferNotificationId: notificationId, transferStatus: 'matched' as const } : op);
        storage.savePendingOperations(next);
        return next;
      });
    }
    addAuditEntry('update', 'transfer_notification', notificationId, 'ربط إشعار تحويل بعملية/زبون');
  }, [addAuditEntry, addNameMapping]);

  // Auto-match: try to find a pending operation that matches a transfer notification by phone or name + amount
  const autoMatchTransferNotification = useCallback((notification: TransferNotification) => {
    const customerList = customersRef.current.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));

    // Strategy 1: Phone-based matching (wallet transfers — sender is a phone number)
    let matchedCustomerId: string | null = null;
    let matchConfidence = 0;
    let fullMatch = false;

    if (notification.senderPhone) {
      const phoneMatch = matchPhoneToCustomer(notification.senderPhone, customerList);
      if (phoneMatch) {
        matchedCustomerId = phoneMatch.customerId;
        matchConfidence = phoneMatch.confidence;
        fullMatch = phoneMatch.fullMatch;
      }
    }

    // Strategy 2: Name-based matching (bank transfers — sender is a name)
    if (!matchedCustomerId && notification.senderName) {
      const nameMatch = matchNameAgainstCustomers(notification.senderName, customerList, nameMappingsRef.current);
      if (nameMatch && nameMatch.customerId) {
        matchedCustomerId = nameMatch.customerId;
        matchConfidence = nameMatch.confidence;
        fullMatch = true;
      }
    }

    if (matchedCustomerId) {
      // Find a pending operation for this customer
      const pendingOp = pendingOperationsRef.current.find((op) =>
        op.status === 'pending' &&
        op.customerId === matchedCustomerId
      );
      if (pendingOp) {
        // Check amount match (within 5% tolerance)
        const sale = telecomSalesRef.current.find((s) => s.simNumber === pendingOp.simNumber || (pendingOp.customerId && s.customerId === matchedCustomerId));
        const expectedAmount = sale?.remaining ?? sale?.total ?? 0;
        const amountMatches = expectedAmount > 0 && Math.abs(notification.amount - expectedAmount) <= Math.max(expectedAmount * 0.05, 1);
        if (amountMatches) {
          setTransferNotifications((prev) => {
            const next = prev.map((n) => n.id === notification.id ? {
              ...n,
              status: 'matched' as TransferNotificationStatus,
              matchedPendingOpId: pendingOp.id,
              matchedSaleId: telecomSalesRef.current.find((s) => s.simNumber === pendingOp.simNumber)?.id ?? null,
              matchedCustomerId,
              matchedTransferReportId: null,
            } : n);
            storage.saveTransferNotifications(next);
            return next;
          });
          setPendingOperations((prev) => {
            const next = prev.map((op) => op.id === pendingOp.id ? { ...op, transferNotificationId: notification.id, transferStatus: 'matched' as const } : op);
            storage.savePendingOperations(next);
            return next;
          });
          const senderLabel = notification.senderName || notification.senderPhone || 'غير معروف';
          void sendLocalNotification('تحويل مطابق', `تم مطابقة تحويل من ${senderLabel} بمبلغ ${notification.amount} ${notification.currency}`);
        }
      }
    }

    // If phone-based partial match (last 2-3 digits, low confidence) — request full number from customer
    if (notification.senderPhone && !fullMatch && matchConfidence < 0.7) {
      void sendLocalNotification(
        'تحويل يحتاج تأكيد',
        `تم استلام تحويل بمبلغ ${notification.amount} ${notification.currency} من رقم ينتهي بـ ${notification.senderPhone.slice(-3)}. تعذر مطابقة الزبون — اطلب منه إرسال الرقم كاملاً`,
      );
    } else if (notification.senderPhone && !matchedCustomerId) {
      // No match at all — request full number
      void sendLocalNotification(
        'تحويل غير مطابق',
        `تم استلام تحويل بمبلغ ${notification.amount} ${notification.currency} من ${notification.senderPhone}. لم يتم العثور على زبون مطابق — اطلب من المرسل إرسال الرقم كاملاً`,
      );
    }
  }, []);

  // Auto-forward timer: check every minute for pending support tickets that have timed out
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      const timeoutMs = (settingsRef.current?.autoForwardTimeoutMinutes ?? 60) * 60 * 1000;
      const now = Date.now();
      const templates = settingsRef.current?.autoReplyTemplates ?? null;
      setSupportTickets((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (t.status === 'pending' && t.forwardReason === 'internet_problem' && (now - t.createdAt) >= timeoutMs) {
            changed = true;
            const msg = buildSupportForwardMessage(t.simNumber, templates);
            if (t.companySupportPhone) {
              void logOutboundSmsRef.current(t.companySupportPhone, msg, 'whatsapp');
            }
            return { ...t, status: 'auto_forwarded' as const, autoForwarded: true, forwardReason: 'timeout' as const, updatedAt: now };
          }
          return t;
        });
        if (changed) storage.saveSupportTickets(next);
        return changed ? next : prev;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [loaded]);

  // Auto-process queued off-hours tickets: when agent opens, forward to support
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setSupportTickets((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (t.status === 'queued_off_hours' && t.queuedForSubAgentId) {
            const agent = subAgentsRef.current.find((a) => a.id === t.queuedForSubAgentId);
            if (agent && isAgentOpen(agent) && t.companySupportPhone) {
              changed = true;
              void logOutboundSmsRef.current(t.companySupportPhone, t.supportMessage, 'whatsapp');
              return { ...t, status: 'auto_forwarded' as const, autoForwarded: true, forwardReason: 'off_hours' as const, updatedAt: now };
            }
          }
          return t;
        });
        if (changed) storage.saveSupportTickets(next);
        return changed ? next : prev;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [loaded]);

  const autoMatchTransferNotificationRef = useRef(autoMatchTransferNotification);
  autoMatchTransferNotificationRef.current = autoMatchTransferNotification;

  // ============ Settings ============
  const updateSettings: AppData['updateSettings'] = useCallback((updates) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      storage.saveSettings(next);
      return next;
    });
  }, []);

  const resetAllData: AppData['resetAllData'] = useCallback(async () => {
    await storage.saveProducts([]);
    await storage.saveCustomers([]);
    await storage.saveTransactions([]);
    await storage.saveSuppliers([]);
    await storage.saveExpenses([]);
    await storage.saveShifts([]);
    await storage.saveDrafts([]);
    await storage.saveStaff([]);
    await storage.savePromotions([]);
    await storage.saveStocktakes([]);
    await storage.saveAttachments([]);
    await storage.saveSimCards([]);
    await storage.saveBundles([]);
    await storage.saveSubAgents([]);
    await storage.saveDebtReminders([]);
    await storage.saveTelecomSales([]);
    await storage.saveAgentBundles([]);
    await storage.saveSimLocations([]);
    await storage.saveSimLocationStock([]);
    await storage.saveTelecomSuppliers([]);
    await storage.saveShipments([]);
    await storage.saveRechargeRequests([]);
    setProducts([]); setCustomers([]); setTransactions([]);
    setSuppliers([]); setExpenses([]); setShifts([]); setDrafts([]);
    setStaff([]); setPromotions([]); setStocktakes([]); setAttachments([]);
    setSimCards([]); setBundles([]); setSubAgents([]); setDebtReminders([]); setTelecomSales([]);
    setAgentBundles([]); setSimLocations([]); setSimLocationStock([]);
    setTelecomSuppliers([]); setShipments([]);
    setRechargeRequests([]);
    setFreezeRequests([]);
    await storage.saveFreezeRequests([]);
    setSupportTickets([]);
    await storage.saveSupportTickets([]);
    setUnrecognizedMessages([]);
    await storage.saveUnrecognizedMessages([]);
    setTransferNotifications([]);
    await storage.saveTransferNotifications([]);
    setTransferReports([]);
    await storage.saveTransferReports([]);
    setNameMappings([]);
    await storage.saveNameMappings([]);
    setKeywordReplies([]);
    setPendingOperations([]);
    setBusinessHours(DEFAULT_BUSINESS_HOURS);
    await storage.saveBusinessHours(DEFAULT_BUSINESS_HOURS);
    await storage.saveKeywordReplies([]);
    await storage.savePendingOperations([]);
  }, []);

  const seedDemoData: AppData['seedDemoData'] = useCallback(async () => {
    const now = Date.now();
    const dayMs = 86400000;
    const demoProducts: Product[] = [
      { id: storage.generateId(), name: 'أرز بسمتي 5كجم', barcode: '6281007021234', localBarcode: '', price: 35, cost: 28, stock: 50, unit: 'كيس', subUnits: [{ name: 'حبة', factor: 1, price: 35 }], minStock: 10, category: 'مواد غذائية', expiryDate: now + dayMs * 90, createdAt: now, updatedAt: now },
      { id: storage.generateId(), name: 'زيت دوار الشمس 1.5ل', barcode: '6281007021235', localBarcode: '', price: 18, cost: 14, stock: 30, unit: 'حبة', subUnits: [], minStock: 8, category: 'مواد غذائية', expiryDate: now + dayMs * 180, createdAt: now, updatedAt: now },
      { id: storage.generateId(), name: 'سكر 1كجم', barcode: '6281007021236', localBarcode: '', price: 6, cost: 4.5, stock: 5, unit: 'كيس', subUnits: [{ name: 'كرتون', factor: 24, price: 120 }], minStock: 15, category: 'مواد غذائية', expiryDate: null, createdAt: now, updatedAt: now },
      { id: storage.generateId(), name: 'شاي 200غ', barcode: '6281007021237', localBarcode: '', price: 12, cost: 8, stock: 25, unit: 'علبة', subUnits: [{ name: 'كرتون', factor: 12, price: 120 }], minStock: 5, category: 'مشروبات', expiryDate: now + dayMs * 5, createdAt: now, updatedAt: now },
      { id: storage.generateId(), name: 'صابون غسيل 3كجم', barcode: '6281007021238', localBarcode: '', price: 25, cost: 19, stock: 3, unit: 'كرتون', subUnits: [], minStock: 5, category: 'منظفات', expiryDate: null, createdAt: now, updatedAt: now },
      { id: storage.generateId(), name: 'ماء معدني 500مل', barcode: '6281007021239', localBarcode: '', price: 1.5, cost: 0.8, stock: 200, unit: 'حبة', subUnits: [{ name: 'دستة', factor: 12, price: 16 }, { name: 'كرتون', factor: 48, price: 60 }], minStock: 48, category: 'مشروبات', expiryDate: null, createdAt: now, updatedAt: now },
    ];
    const demoCustomers: Customer[] = [
      { id: storage.generateId(), name: 'أحمد محمد', phone: '0555123456', tier: 'vip', debt: 150, balance: 200, creditLimit: 1000, discountPercent: 5, notes: 'زبون مميز', subscriptionNumber: '', subscriptionExpiry: now + dayMs * 3, loyaltyPoints: 320, createdAt: now, updatedAt: now },
      { id: storage.generateId(), name: 'سارة عبدالله', phone: '0555987654', tier: 'regular', debt: 0, balance: 0, creditLimit: 500, discountPercent: 0, notes: '', subscriptionNumber: '', subscriptionExpiry: null, loyaltyPoints: 85, createdAt: now, updatedAt: now },
      { id: storage.generateId(), name: 'خالد العتيبي', phone: '0533445566', tier: 'regular', debt: 75, balance: 0, creditLimit: 300, discountPercent: 0, notes: '', subscriptionNumber: '', subscriptionExpiry: now - dayMs * 20, loyaltyPoints: 40, createdAt: now - dayMs * 25, updatedAt: now },
    ];
    const demoSuppliers: Supplier[] = [
      { id: storage.generateId(), name: 'شركة الإمداد الغذائي', phone: '0112345678', company: 'الإمداد', balance: 2500, notes: 'مورد مواد غذائية رئيسي', createdAt: now, updatedAt: now },
      { id: storage.generateId(), name: 'مؤسسة النور للمشروبات', phone: '0118765432', company: 'النور', balance: 0, notes: '', createdAt: now, updatedAt: now },
    ];
    const demoTxns: Transaction[] = [];
    for (let i = 0; i < 5; i++) {
      demoTxns.push({
        id: storage.generateId(),
        createdAt: now - i * dayMs,
        type: 'sale',
        customerId: null,
        customerName: 'عميل نقدي',
        supplierId: null,
        supplierName: '',
        items: [{ productId: demoProducts[0].id, name: demoProducts[0].name, price: demoProducts[0].price, cost: demoProducts[0].cost, quantity: 3, unit: demoProducts[0].unit }],
        total: 105,
        paid: 105,
        remaining: 0,
        paymentMethod: 'cash',
        splitPayment: null,
        debtChange: 0,
        loyaltyEarned: 0,
        note: '',
        smsSent: false,
        returnReason: '',
        originalTxnId: null,
        currencyCode: 'SAR',
        shiftId: null,
        staffId: null,
        staffName: '',
        promotionApplied: null,
        discountAmount: 0,
        walletType: null,
      });
    }
    await storage.saveProducts(demoProducts);
    await storage.saveCustomers(demoCustomers);
    await storage.saveTransactions(demoTxns);
    await storage.saveSuppliers(demoSuppliers);
    setProducts(demoProducts);
    setCustomers(demoCustomers);
    setTransactions(demoTxns);
    setSuppliers(demoSuppliers);
  }, []);

  const createBackup: AppData['createBackup'] = useCallback(async () => {
    const backup: BackupData = {
      products,
      customers,
      transactions,
      settings,
      auditLog,
      suppliers,
      expenses,
      shifts,
      currencies,
      staff,
      promotions,
      stocktakes,
      attachments,
      timestamp: Date.now(),
    };
    await storage.saveBackup(backup);
    addAuditEntry('backup', 'system', '', 'إنشاء نسخة احتياطية');
  }, [products, customers, transactions, settings, auditLog, suppliers, expenses, shifts, currencies, staff, promotions, stocktakes, attachments, addAuditEntry]);

  // Auto-backup: every hour, save a local backup when enabled
  const createBackupRef = useRef(createBackup);
  createBackupRef.current = createBackup;

  useEffect(() => {
    if (!loaded) return;
    if (!settingsRef.current?.enableAutoBackup) return;

    const interval = setInterval(() => {
      createBackupRef.current().catch(() => {});
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [loaded]);

  const restoreBackup: AppData['restoreBackup'] = useCallback(async () => {
    const backup = await storage.getBackup();
    if (!backup) return false;
    await storage.saveProducts(backup.products);
    await storage.saveCustomers(backup.customers);
    await storage.saveTransactions(backup.transactions);
    await storage.saveSettings(backup.settings);
    await storage.saveAuditLog(backup.auditLog || []);
    await storage.saveSuppliers(backup.suppliers || []);
    await storage.saveExpenses(backup.expenses || []);
    await storage.saveShifts(backup.shifts || []);
    await storage.saveCurrencies(backup.currencies || []);
    await storage.saveStaff(backup.staff || []);
    await storage.savePromotions(backup.promotions || []);
    await storage.saveStocktakes(backup.stocktakes || []);
    await storage.saveAttachments(backup.attachments || []);
    setProducts(backup.products);
    setCustomers(backup.customers);
    setTransactions(backup.transactions);
    setSettings(backup.settings);
    setAuditLog(backup.auditLog || []);
    setSuppliers(backup.suppliers || []);
    setExpenses(backup.expenses || []);
    setShifts(backup.shifts || []);
    setCurrencies(backup.currencies || []);
    setStaff(backup.staff || []);
    setPromotions(backup.promotions || []);
    setStocktakes(backup.stocktakes || []);
    setAttachments(backup.attachments || []);
    addAuditEntry('restore', 'system', '', 'استعادة نسخة احتياطية');
    return true;
  }, [addAuditEntry]);

  const hasBackup: AppData['hasBackup'] = useCallback(async () => {
    const backup = await storage.getBackup();
    return backup !== null;
  }, []);

  const exportBackupFile: AppData['exportBackupFile'] = useCallback(async () => {
    const data = {
      products, customers, transactions, settings, auditLog,
      suppliers, expenses, shifts, currencies, staff,
      promotions, stocktakes, attachments,
      telecomCompanies, simCards, bundles, subAgents, debtReminders,
      telecomSales, agentBundles, simLocations, simLocationStock,
      telecomSuppliers, shipments, rechargeRequests,
      businessHours, keywordReplies, pendingOperations,
      freezeRequests, supportTickets, unrecognizedMessages,
      transferNotifications, transferReports, nameMappings, customerFiles,
      timestamp: Date.now(),
      version: 1,
    };
    const filename = `sahab-backup-${new Date().toISOString().split('T')[0]}.json`;
    await shareBackupFile(JSON.stringify(data), filename);
    addAuditEntry('backup', 'system', '', 'تصدير نسخة احتياطية كملف');
    return true;
  }, [products, customers, transactions, settings, auditLog, suppliers, expenses, shifts, currencies, staff, promotions, stocktakes, attachments, telecomCompanies, simCards, bundles, subAgents, debtReminders, telecomSales, agentBundles, simLocations, simLocationStock, telecomSuppliers, shipments, rechargeRequests, businessHours, keywordReplies, pendingOperations, freezeRequests, supportTickets, unrecognizedMessages, transferNotifications, transferReports, nameMappings, customerFiles, addAuditEntry]);

  const importBackupFile: AppData['importBackupFile'] = useCallback(async () => {
    const raw = await pickBackupFile();
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!data.products || !data.customers || !data.transactions) return false;

      setProducts(data.products);
      setCustomers(data.customers);
      setTransactions(data.transactions);
      if (data.settings) setSettings(data.settings);
      if (data.auditLog) setAuditLog(data.auditLog);
      if (data.suppliers) setSuppliers(data.suppliers);
      if (data.expenses) setExpenses(data.expenses);
      if (data.shifts) setShifts(data.shifts);
      if (data.currencies) setCurrencies(data.currencies);
      if (data.staff) setStaff(data.staff);
      if (data.promotions) setPromotions(data.promotions);
      if (data.stocktakes) setStocktakes(data.stocktakes);
      if (data.attachments) setAttachments(data.attachments);
      if (data.telecomCompanies) setTelecomCompanies(data.telecomCompanies);
      if (data.simCards) setSimCards(data.simCards);
      if (data.bundles) setBundles(data.bundles);
      if (data.subAgents) setSubAgents(data.subAgents);
      if (data.debtReminders) setDebtReminders(data.debtReminders);
      if (data.telecomSales) setTelecomSales(data.telecomSales);
      if (data.agentBundles) setAgentBundles(data.agentBundles);
      if (data.simLocations) setSimLocations(data.simLocations);
      if (data.simLocationStock) setSimLocationStock(data.simLocationStock);
      if (data.telecomSuppliers) setTelecomSuppliers(data.telecomSuppliers);
      if (data.shipments) setShipments(data.shipments);
      if (data.rechargeRequests) setRechargeRequests(data.rechargeRequests);
      if (data.businessHours) setBusinessHours(data.businessHours);
      if (data.keywordReplies) setKeywordReplies(data.keywordReplies);
      if (data.pendingOperations) setPendingOperations(data.pendingOperations);
      if (data.freezeRequests) setFreezeRequests(data.freezeRequests);
      if (data.supportTickets) setSupportTickets(data.supportTickets);
      if (data.unrecognizedMessages) setUnrecognizedMessages(data.unrecognizedMessages);
      if (data.transferNotifications) setTransferNotifications(data.transferNotifications);
      if (data.transferReports) setTransferReports(data.transferReports);
      if (data.nameMappings) setNameMappings(data.nameMappings);
      if (data.customerFiles) setCustomerFiles(data.customerFiles);

      await storage.saveProducts(data.products);
      await storage.saveCustomers(data.customers);
      await storage.saveTransactions(data.transactions);
      if (data.settings) await storage.saveSettings(data.settings);
      if (data.auditLog) await storage.saveAuditLog(data.auditLog);
      if (data.suppliers) await storage.saveSuppliers(data.suppliers);
      if (data.expenses) await storage.saveExpenses(data.expenses);
      if (data.shifts) await storage.saveShifts(data.shifts);
      if (data.currencies) await storage.saveCurrencies(data.currencies);
      if (data.staff) await storage.saveStaff(data.staff);
      if (data.promotions) await storage.savePromotions(data.promotions);
      if (data.stocktakes) await storage.saveStocktakes(data.stocktakes);
      if (data.attachments) await storage.saveAttachments(data.attachments);
      if (data.telecomCompanies) await storage.saveTelecomCompanies(data.telecomCompanies);
      if (data.simCards) await storage.saveSimCards(data.simCards);
      if (data.bundles) await storage.saveBundles(data.bundles);
      if (data.subAgents) await storage.saveSubAgents(data.subAgents);
      if (data.debtReminders) await storage.saveDebtReminders(data.debtReminders);
      if (data.telecomSales) await storage.saveTelecomSales(data.telecomSales);
      if (data.agentBundles) await storage.saveAgentBundles(data.agentBundles);
      if (data.simLocations) await storage.saveSimLocations(data.simLocations);
      if (data.simLocationStock) await storage.saveSimLocationStock(data.simLocationStock);
      if (data.telecomSuppliers) await storage.saveTelecomSuppliers(data.telecomSuppliers);
      if (data.shipments) await storage.saveShipments(data.shipments);
      if (data.rechargeRequests) await storage.saveRechargeRequests(data.rechargeRequests);
      if (data.businessHours) await storage.saveBusinessHours(data.businessHours);
      if (data.keywordReplies) await storage.saveKeywordReplies(data.keywordReplies);
      if (data.pendingOperations) await storage.savePendingOperations(data.pendingOperations);
      if (data.freezeRequests) await storage.saveFreezeRequests(data.freezeRequests);
      if (data.supportTickets) await storage.saveSupportTickets(data.supportTickets);
      if (data.unrecognizedMessages) await storage.saveUnrecognizedMessages(data.unrecognizedMessages);
      if (data.transferNotifications) await storage.saveTransferNotifications(data.transferNotifications);
      if (data.transferReports) await storage.saveTransferReports(data.transferReports);
      if (data.nameMappings) await storage.saveNameMappings(data.nameMappings);
      if (data.customerFiles) await storage.saveCustomerFiles(data.customerFiles);

      addAuditEntry('restore', 'system', '', 'استيراد نسخة احتياطية من ملف');
      return true;
    } catch {
      return false;
    }
  }, [addAuditEntry]);

  const uploadCloudBackup: AppData['uploadCloudBackup'] = useCallback(async (label?: string) => {
    const data: FullBackupData = {
      products, customers, transactions, settings, auditLog,
      suppliers, expenses, shifts, currencies, staff,
      promotions, stocktakes, attachments,
      telecomCompanies, simCards, bundles, subAgents, debtReminders,
      telecomSales, agentBundles, simLocations, simLocationStock,
      telecomSuppliers, shipments, rechargeRequests,
      businessHours, keywordReplies, pendingOperations,
      freezeRequests, supportTickets, unrecognizedMessages,
      transferNotifications, transferReports, nameMappings, customerFiles,
      smsMessages,
      timestamp: Date.now(),
      version: 1,
    };
    const result = await uploadCloudSnapshot(data, label || '');
    if (result.success) addAuditEntry('backup', 'system', '', 'رفع نسخة احتياطية للسحابة');
    return result;
  }, [products, customers, transactions, settings, auditLog, suppliers, expenses, shifts, currencies, staff, promotions, stocktakes, attachments, telecomCompanies, simCards, bundles, subAgents, debtReminders, telecomSales, agentBundles, simLocations, simLocationStock, telecomSuppliers, shipments, rechargeRequests, businessHours, keywordReplies, pendingOperations, freezeRequests, supportTickets, unrecognizedMessages, transferNotifications, transferReports, nameMappings, customerFiles, smsMessages, addAuditEntry]);

  const listCloudBackups: AppData['listCloudBackups'] = useCallback(async () => {
    return listCloudSnapshots();
  }, []);

  const restoreCloudBackup: AppData['restoreCloudBackup'] = useCallback(async (id: string) => {
    const { data, error } = await downloadCloudSnapshot(id);
    if (error || !data) return { success: false, error: error || 'تعذر تحميل النسخة' };

    setProducts(data.products as Product[]); storage.saveProducts(data.products as Product[]);
    setCustomers(data.customers as Customer[]); storage.saveCustomers(data.customers as Customer[]);
    setTransactions(data.transactions as Transaction[]); storage.saveTransactions(data.transactions as Transaction[]);
    if (data.settings) { setSettings(data.settings as Settings); storage.saveSettings(data.settings as Settings); }
    if (data.auditLog) { setAuditLog(data.auditLog as AuditEntry[]); storage.saveAuditLog(data.auditLog as AuditEntry[]); }
    if (data.suppliers) { setSuppliers(data.suppliers as Supplier[]); storage.saveSuppliers(data.suppliers as Supplier[]); }
    if (data.expenses) { setExpenses(data.expenses as Expense[]); storage.saveExpenses(data.expenses as Expense[]); }
    if (data.shifts) { setShifts(data.shifts as Shift[]); storage.saveShifts(data.shifts as Shift[]); }
    if (data.currencies) { setCurrencies(data.currencies as Currency[]); storage.saveCurrencies(data.currencies as Currency[]); }
    if (data.staff) { setStaff(data.staff as Staff[]); storage.saveStaff(data.staff as Staff[]); }
    if (data.promotions) { setPromotions(data.promotions as Promotion[]); storage.savePromotions(data.promotions as Promotion[]); }
    if (data.stocktakes) { setStocktakes(data.stocktakes as Stocktake[]); storage.saveStocktakes(data.stocktakes as Stocktake[]); }
    if (data.attachments) { setAttachments(data.attachments as Attachment[]); storage.saveAttachments(data.attachments as Attachment[]); }
    if (data.telecomCompanies) { setTelecomCompanies(data.telecomCompanies as TelecomCompany[]); storage.saveTelecomCompanies(data.telecomCompanies as TelecomCompany[]); }
    if (data.simCards) { setSimCards(data.simCards as SimCard[]); storage.saveSimCards(data.simCards as SimCard[]); }
    if (data.bundles) { setBundles(data.bundles as Bundle[]); storage.saveBundles(data.bundles as Bundle[]); }
    if (data.subAgents) { setSubAgents(data.subAgents as SubAgent[]); storage.saveSubAgents(data.subAgents as SubAgent[]); }
    if (data.debtReminders) { setDebtReminders(data.debtReminders as DebtReminderSchedule[]); storage.saveDebtReminders(data.debtReminders as DebtReminderSchedule[]); }
    if (data.telecomSales) { setTelecomSales(data.telecomSales as TelecomSale[]); storage.saveTelecomSales(data.telecomSales as TelecomSale[]); }
    if (data.agentBundles) { const normalized = normalizeAgentBundles(data.agentBundles as AgentBundle[]); setAgentBundles(normalized); storage.saveAgentBundles(normalized); }
    if (data.simLocations) { setSimLocations(data.simLocations as SimLocation[]); storage.saveSimLocations(data.simLocations as SimLocation[]); }
    if (data.simLocationStock) { setSimLocationStock(data.simLocationStock as SimLocationStock[]); storage.saveSimLocationStock(data.simLocationStock as SimLocationStock[]); }
    if (data.telecomSuppliers) { setTelecomSuppliers(data.telecomSuppliers as TelecomSupplier[]); storage.saveTelecomSuppliers(data.telecomSuppliers as TelecomSupplier[]); }
    if (data.shipments) { setShipments(data.shipments as Shipment[]); storage.saveShipments(data.shipments as Shipment[]); }
    if (data.rechargeRequests) { setRechargeRequests(data.rechargeRequests as RechargeRequest[]); storage.saveRechargeRequests(data.rechargeRequests as RechargeRequest[]); }
    if (data.businessHours) { setBusinessHours(data.businessHours as unknown as BusinessHoursConfig); storage.saveBusinessHours(data.businessHours as unknown as BusinessHoursConfig); }
    if (data.keywordReplies) { setKeywordReplies(data.keywordReplies as KeywordReply[]); storage.saveKeywordReplies(data.keywordReplies as KeywordReply[]); }
    if (data.pendingOperations) { setPendingOperations(data.pendingOperations as PendingOperation[]); storage.savePendingOperations(data.pendingOperations as PendingOperation[]); }
    if (data.freezeRequests) { setFreezeRequests(data.freezeRequests as FreezeRequest[]); storage.saveFreezeRequests(data.freezeRequests as FreezeRequest[]); }
    if (data.supportTickets) { setSupportTickets(data.supportTickets as SupportTicket[]); storage.saveSupportTickets(data.supportTickets as SupportTicket[]); }
    if (data.unrecognizedMessages) { setUnrecognizedMessages(data.unrecognizedMessages as UnrecognizedMessage[]); storage.saveUnrecognizedMessages(data.unrecognizedMessages as UnrecognizedMessage[]); }
    if (data.transferNotifications) { setTransferNotifications(data.transferNotifications as TransferNotification[]); storage.saveTransferNotifications(data.transferNotifications as TransferNotification[]); }
    if (data.transferReports) { setTransferReports(data.transferReports as TransferReport[]); storage.saveTransferReports(data.transferReports as TransferReport[]); }
    if (data.nameMappings) { setNameMappings(data.nameMappings as NameMapping[]); storage.saveNameMappings(data.nameMappings as NameMapping[]); }
    if (data.customerFiles) { setCustomerFiles(data.customerFiles as CustomerFile[]); storage.saveCustomerFiles(data.customerFiles as CustomerFile[]); }
    if (data.smsMessages) { setSmsMessages(data.smsMessages as SmsMessage[]); storage.saveSmsMessages(data.smsMessages as SmsMessage[]); }

    addAuditEntry('restore', 'system', '', 'استعادة نسخة احتياطية من السحابة');
    return { success: true };
  }, [addAuditEntry]);

  const deleteCloudBackup: AppData['deleteCloudBackup'] = useCallback(async (id: string) => {
    return deleteCloudSnapshot(id);
  }, []);

  // ============ SMS Messages (Inbox) ============
  const addSmsMessage: AppData['addSmsMessage'] = useCallback((m) => {
    const msg: SmsMessage = { ...m, id: storage.generateId(), timestamp: Date.now() };
    setSmsMessages((prev) => { const next = [msg, ...prev]; storage.saveSmsMessages(next); return next; });
    return msg;
  }, []);

  const updateSmsMessage: AppData['updateSmsMessage'] = useCallback((id, updates) => {
    setSmsMessages((prev) => {
      const next = prev.map((m) => m.id === id ? { ...m, ...updates } : m);
      storage.saveSmsMessages(next);
      return next;
    });
  }, []);

  const deleteSmsMessage: AppData['deleteSmsMessage'] = useCallback((id) => {
    setSmsMessages((prev) => { const next = prev.filter((m) => m.id !== id); storage.saveSmsMessages(next); return next; });
  }, []);

  const markSmsRead: AppData['markSmsRead'] = useCallback((id) => {
    setSmsMessages((prev) => {
      const next = prev.map((m) => m.id === id && m.status === 'new' ? { ...m, status: 'read' as const, readAt: Date.now() } : m);
      storage.saveSmsMessages(next);
      return next;
    });
  }, []);

  const logOutboundSms = useCallback(async (phone: string, body: string, channel: MessageChannel = 'sms', subscriptionId?: number) => {
    let result: { success: boolean; error?: string; eventId?: string };
    if (channel === 'sms') {
      result = await sendSmsAuto(phone, body, subscriptionId);
    } else {
      result = await sendMessageByChannel(phone, body, channel);
    }
    const msg: SmsMessage = {
      id: storage.generateId(),
      direction: 'outbound',
      senderPhone: phone,
      senderName: '',
      body,
      category: 'general',
      status: 'read',
      processAction: 'none',
      linkedPendingOpId: null,
      linkedTransferNotificationId: null,
      linkedSupportTicketId: null,
      linkedUnrecognizedMsgId: null,
      autoReplied: false,
      autoReplyText: null,
      timestamp: Date.now(),
      readAt: Date.now(),
      sendStatus: result.success ? 'sent' : 'failed',
      outboxEventId: (result as { eventId?: string }).eventId ?? null,
    };
    setSmsMessages((prev) => { const next = [msg, ...prev]; storage.saveSmsMessages(next); return next; });
    return result;
  }, []);

  const sendSmsReply: AppData['sendSmsReply'] = useCallback(async (phone, body, subscriptionId?) => {
    return logOutboundSms(phone, body, 'sms', subscriptionId);
  }, [logOutboundSms]);

  const logOutboundSmsRef = useRef(logOutboundSms);
  logOutboundSmsRef.current = logOutboundSms;

  // ===== SMS Inbox Extras: Pin, Block, Archive, Quick Reply, Schedule =====

  const togglePinConversation = useCallback((phone: string) => {
    setPinnedConversations((prev) => {
      const next = prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone];
      storage.savePinnedConversations(next);
      return next;
    });
  }, []);

  const toggleBlockNumber = useCallback((phone: string) => {
    setBlockedNumbers((prev) => {
      const normalized = phone.replace(/[^0-9]/g, '');
      const next = prev.some((p) => p.replace(/[^0-9]/g, '') === normalized)
        ? prev.filter((p) => p.replace(/[^0-9]/g, '') !== normalized)
        : [...prev, phone];
      storage.saveBlockedNumbers(next);
      return next;
    });
  }, []);

  const isNumberBlocked = useCallback((phone: string) => {
    const normalized = phone.replace(/[^0-9]/g, '');
    return blockedNumbers.some((p) => p.replace(/[^0-9]/g, '') === normalized);
  }, [blockedNumbers]);

  const toggleArchiveConversation = useCallback((phone: string) => {
    setArchivedConversations((prev) => {
      const next = prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone];
      storage.saveArchivedConversations(next);
      return next;
    });
  }, []);

  const addQuickReplyTemplate = useCallback((t: Omit<QuickReplyTemplate, 'id' | 'createdAt'>) => {
    const template: QuickReplyTemplate = { ...t, id: storage.generateId(), createdAt: Date.now() };
    setQuickReplyTemplates((prev) => { const next = [...prev, template]; storage.saveQuickReplyTemplates(next); return next; });
    return template;
  }, []);

  const updateQuickReplyTemplate = useCallback((id: string, updates: Partial<QuickReplyTemplate>) => {
    setQuickReplyTemplates((prev) => { const next = prev.map((t) => t.id === id ? { ...t, ...updates } : t); storage.saveQuickReplyTemplates(next); return next; });
  }, []);

  const deleteQuickReplyTemplate = useCallback((id: string) => {
    setQuickReplyTemplates((prev) => { const next = prev.filter((t) => t.id !== id); storage.saveQuickReplyTemplates(next); return next; });
  }, []);

  const addScheduledMessage = useCallback((s: Omit<ScheduledSms, 'id' | 'createdAt'>) => {
    const msg: ScheduledSms = { ...s, id: storage.generateId(), createdAt: Date.now() };
    setScheduledMessages((prev) => { const next = [...prev, msg]; storage.saveScheduledMessages(next); return next; });
    return msg;
  }, []);

  const deleteScheduledMessage = useCallback((id: string) => {
    setScheduledMessages((prev) => { const next = prev.filter((s) => s.id !== id); storage.saveScheduledMessages(next); return next; });
  }, []);

  const checkScheduledMessages = useCallback(() => {
    const now = Date.now();
    setScheduledMessages((prev) => {
      const updated: ScheduledSms[] = [];
      for (const s of prev) {
        if (!s.sent && s.scheduledAt <= now) {
          void logOutboundSmsRef.current(s.phone, s.message, 'sms', s.subscriptionId ?? undefined);
          updated.push({ ...s, sent: true });
        } else {
          updated.push(s);
        }
      }
      storage.saveScheduledMessages(updated);
      return updated;
    });
  }, []);

  // ============ Phone Numbers ============
  const addPhoneNumber: AppData['addPhoneNumber'] = useCallback((e) => {
    const entry: PhoneNumberEntry = { ...e, id: storage.generateId(), createdAt: Date.now(), updatedAt: Date.now() };
    setPhoneNumbers((prev) => { const next = [entry, ...prev]; storage.savePhoneNumbers(next); return next; });
    return entry;
  }, []);

  const updatePhoneNumber: AppData['updatePhoneNumber'] = useCallback((id, updates) => {
    setPhoneNumbers((prev) => {
      const next = prev.map((e) => e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e);
      storage.savePhoneNumbers(next);
      return next;
    });
  }, []);

  const deletePhoneNumber: AppData['deletePhoneNumber'] = useCallback((id) => {
    setPhoneNumbers((prev) => { const next = prev.filter((e) => e.id !== id); storage.savePhoneNumbers(next); return next; });
  }, []);

  const linkPhoneNumbersToTransactions: AppData['linkPhoneNumbersToTransactions'] = useCallback(() => {
    let linkedCount = 0;
    setPhoneNumbers((prev) => {
      const next = prev.map((entry) => {
        if (entry.customerName && entry.customerPhone) return entry;
        const match = telecomSales.find((s) => s.simNumber === entry.phoneNumber || s.customerPhone === entry.phoneNumber);
        if (match) {
          linkedCount++;
          return {
            ...entry,
            customerName: match.customerName,
            customerPhone: match.customerPhone,
            companyName: entry.companyName || match.companyName,
            subAgentName: entry.subAgentName || match.subAgentName,
            lastTransactionAt: match.createdAt,
            lastTransactionType: match.operationType,
            updatedAt: Date.now(),
          };
        }
        return entry;
      });
      storage.savePhoneNumbers(next);
      return next;
    });
    return linkedCount;
  }, [telecomSales]);

  // Poll for scheduled messages every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => checkScheduledMessages(), 30000);
    return () => clearInterval(interval);
  }, [checkScheduledMessages]);

  // Poll for SMS delivery status updates every 20 seconds
  // Checks outbound messages with outboxEventId that are still in 'sent' or 'pending' state
  // and updates their sendStatus to 'delivered' or 'failed' when the server confirms delivery
  useEffect(() => {
    const checkDeliveryStatuses = async () => {
      const pendingOutbound = smsMessages.filter(
        (m) => m.direction === 'outbound' && m.outboxEventId && (m.sendStatus === 'sent' || m.sendStatus === 'pending'),
      );
      if (pendingOutbound.length === 0) return;

      const eventIds = pendingOutbound.map((m) => m.outboxEventId!);
      const statuses = await fetchOutboxStatuses(eventIds);
      if (Object.keys(statuses).length === 0) return;

      let changed = false;
      setSmsMessages((prev) => {
        const next = prev.map((m) => {
          if (!m.outboxEventId) return m;
          const status = statuses[m.outboxEventId];
          if (!status) return m;
          if (status.delivery_status === 'delivered' && m.sendStatus !== 'delivered') {
            changed = true;
            return { ...m, sendStatus: 'delivered' as const };
          }
          if (status.delivery_status === 'failed' && m.sendStatus !== 'failed') {
            changed = true;
            return { ...m, sendStatus: 'failed' as const };
          }
          if (status.status === 'sent' && m.sendStatus === 'pending') {
            changed = true;
            return { ...m, sendStatus: 'sent' as const };
          }
          if (status.status === 'failed' && m.sendStatus !== 'failed') {
            changed = true;
            return { ...m, sendStatus: 'failed' as const };
          }
          return m;
        });
        if (changed) storage.saveSmsMessages(next);
        return next;
      });
    };

    const interval = setInterval(() => void checkDeliveryStatuses(), 20000);
    return () => clearInterval(interval);
  }, [smsMessages]);

  const importDeviceSmsMessages: AppData['importDeviceSmsMessages'] = useCallback(async () => {
    const result = await importDeviceSms();
    if (!result.success || !result.messages) {
      return { success: false, imported: 0, error: result.error };
    }

    const existingPhones = new Set(smsMessages.map((m) => `${m.direction}-${m.senderPhone}-${m.body}`));
    const newMessages: SmsMessage[] = [];
    const seen = new Set<string>();

    for (const imported of result.messages) {
      const dedupeKey = `${imported.direction}-${imported.address}-${imported.body}`;
      if (existingPhones.has(dedupeKey) || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const { category, processAction } = classifySmsMessage(imported.body, imported.address);

      newMessages.push({
        id: storage.generateId(),
        direction: imported.direction,
        senderPhone: imported.address,
        senderName: '',
        body: imported.body,
        category,
        status: imported.read ? 'read' : 'new',
        processAction,
        linkedPendingOpId: null,
        linkedTransferNotificationId: null,
        linkedSupportTicketId: null,
        linkedUnrecognizedMsgId: null,
        autoReplied: false,
        autoReplyText: null,
        timestamp: imported.date,
        readAt: imported.read ? imported.date : null,
        sendStatus: 'none' as const,
        outboxEventId: null,
      });
    }

    if (newMessages.length > 0) {
      setSmsMessages((prev) => {
        const next = [...newMessages, ...prev].sort((a, b) => b.timestamp - a.timestamp);
        storage.saveSmsMessages(next);
        return next;
      });
    }

    return { success: true, imported: newMessages.length };
  }, [smsMessages]);

  const clearAuditLog: AppData['clearAuditLog'] = useCallback(() => {
    setAuditLog([]);
    storage.saveAuditLog([]);
  }, []);

  const activeShift = shifts.find((s) => s.status === 'open') ?? null;

  const now = Date.now();
  const dayMs = 86400000;
  const expiringProductsCount = products.filter((p) => p.expiryDate !== null && p.expiryDate - now < (settings?.expiryAlertDays ?? 7) * dayMs).length;
  const oldDebtsCount = customers.filter((c) => c.debt > 0).length;

  const stats: DashboardStats = {
    todaySales: transactions.filter((t) => t.type === 'sale' && isToday(t.createdAt)).reduce((sum, t) => sum + t.total, 0),
    todayProfit: transactions.filter((t) => t.type === 'sale' && isToday(t.createdAt)).reduce((sum, t) => sum + calculateProfit(t.items, products), 0),
    totalDebt: customers.reduce((sum, c) => sum + c.debt, 0),
    totalProducts: products.length,
    lowStockCount: products.filter((p) => p.stock <= p.minStock).length,
    todayTransactions: transactions.filter((t) => isToday(t.createdAt)).length,
    totalCustomers: customers.length,
    todayExpenses: expenses.filter((e) => isToday(e.createdAt)).reduce((sum, e) => sum + e.amount, 0),
    totalSuppliersBalance: suppliers.reduce((sum, s) => sum + s.balance, 0),
    expiringProductsCount,
    oldDebtsCount,
  };

  const predictions: StockPrediction[] = settings?.enableStockPrediction
    ? products
        .map((p) => predictStockOut(p.id, p.name, p.stock, transactions))
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .filter((p) => p.urgency !== 'safe')
        .sort((a, b) => (a.daysUntilEmpty ?? 999) - (b.daysUntilEmpty ?? 999))
    : [];

  const smartAlerts: SmartAlert[] = settings?.enableSmartAlerts ? [
    ...customers.filter((c) => c.debt > 0).map((c) => ({
      id: `debt-${c.id}`,
      type: 'debt' as const,
      title: 'دين مستحق',
      message: `${c.name} لديه دين بقيمة ${c.debt.toFixed(2)}`,
      entityId: c.id,
      severity: c.debt > (c.creditLimit * 0.8) ? 'danger' as const : 'warning' as const,
      createdAt: now,
    })),
    ...products.filter((p) => p.expiryDate !== null && p.expiryDate - now < (settings.expiryAlertDays) * dayMs).map((p) => ({
      id: `expiry-${p.id}`,
      type: 'expiry' as const,
      title: 'منتج قارب على الانتهاء',
      message: `${p.name} ينتهي خلال ${Math.ceil((p.expiryDate! - now) / dayMs)} يوم`,
      entityId: p.id,
      severity: p.expiryDate! - now < 3 * dayMs ? 'danger' as const : 'warning' as const,
      createdAt: now,
    })),
    ...products.filter((p) => p.stock <= p.minStock).map((p) => ({
      id: `low-${p.id}`,
      type: 'low_stock' as const,
      title: 'مخزون منخفض',
      message: `${p.name} - المخزون: ${p.stock} (الحد الأدنى: ${p.minStock})`,
      entityId: p.id,
      severity: 'info' as const,
      createdAt: now,
    })),
  ] : [];

  if (!settings) {
    return null;
  }

  return (
    <AppContext.Provider
      value={{
        products,
        customers,
        transactions,
        suppliers,
        expenses,
        shifts,
        drafts,
        currencies,
        staff,
        promotions,
        stocktakes,
        attachments,
        currentStaff,
        smartAlerts,
        license,
        readOnlyMode: isReadOnly(license),
        settings,
        auditLog,
        loaded,
        stats,
        predictions,
        activeShift,
        telecomCompanies,
        simCards,
        bundles,
        subAgents,
        debtReminders,
        telecomSales,
        agentBundles,
        simLocations,
        simLocationStock,
        telecomSuppliers,
        shipments,
        addTelecomCompany,
        updateTelecomCompany,
        deleteTelecomCompany,
        addSimCard,
        updateSimCard,
        deleteSimCard,
        addBundle,
        updateBundle,
        deleteBundle,
        addSubAgent,
        updateSubAgent,
        deleteSubAgent,
        rechargeSubAgent,
        addTelecomSale,
        updateTelecomSale,
        deleteTelecomSale,
        cancelTelecomSale,
        editTelecomSalePrice,
        collectTelecomSaleDebt,
        checkAutoRenewals,
        addDebtReminder,
        updateDebtReminder,
        deleteDebtReminder,
        checkAndSendReminders,
        addAgentBundle,
        updateAgentBundle,
        deleteAgentBundle,
        addSimLocation,
        updateSimLocation,
        deleteSimLocation,
        addSimLocationStock,
        updateSimLocationStock,
        deleteSimLocationStock,
        addTelecomSupplier,
        updateTelecomSupplier,
        deleteTelecomSupplier,
        addShipment,
        deleteShipment,
        rechargeRequests,
        businessHours,
        keywordReplies,
        pendingOperations,
        updateBusinessHours,
        addKeywordReply,
        updateKeywordReply,
        deleteKeywordReply,
        addPendingOperation,
        updatePendingOperation,
        deletePendingOperation,
        executePendingOperation,
        processEscalationReply,
        checkEscalationReminders,
        executeFreezeRequest,
        cancelFreezeRequest,
        reactivateSale,
        freezeRequests,
        supportTickets,
        unrecognizedMessages,
        transferNotifications,
        transferReports,
        nameMappings,
        customerFiles,
        smsMessages,
        addSmsMessage,
        updateSmsMessage,
        deleteSmsMessage,
        markSmsRead,
        sendSmsReply,
        logOutboundSms,
        importDeviceSmsMessages,
        pinnedConversations,
        togglePinConversation,
        blockedNumbers,
        toggleBlockNumber,
        isNumberBlocked,
        archivedConversations,
        toggleArchiveConversation,
        quickReplyTemplates,
        addQuickReplyTemplate,
        updateQuickReplyTemplate,
        deleteQuickReplyTemplate,
        scheduledMessages,
        addScheduledMessage,
        deleteScheduledMessage,
        checkScheduledMessages,
        phoneNumbers,
        addPhoneNumber,
        updatePhoneNumber,
        deletePhoneNumber,
        linkPhoneNumbersToTransactions,
        addSupportTicket,
        updateSupportTicket,
        deleteSupportTicket,
        forwardSupportReply,
        confirmRechargeBySupport,
        learnFromMessage,
        ignoreUnrecognizedMessage,
        deleteUnrecognizedMessage,
        addTransferNotification,
        updateTransferNotification,
        deleteTransferNotification,
        confirmTransferNotification,
        rejectTransferNotification,
        addTransferReport,
        updateTransferReport,
        deleteTransferReport,
        addNameMapping,
        deleteNameMapping,
        linkTransferNotification,
        addRechargeRequest,
        updateRechargeRequest,
        deleteRechargeRequest,
        confirmRechargeRequest,
        checkRechargeAlerts,
        addProduct,
        updateProduct,
        deleteProduct,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        createCustomerFiles,
        mergeDuplicateCustomers,
        recordPayment,
        updatePayment,
        addCustomerBalance,
        redeemLoyalty,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        recordSupplierPayment,
        recordPurchase,
        addTransaction,
        deleteTransaction,
        processReturn,
        addExpense,
        deleteExpense,
        walletTxns,
        getWalletBalance,
        getTotalWalletsBalance,
        getCashBalance,
        addWalletTransaction,
        transferBetweenWallets,
        adjustWalletBalance,
        deleteWalletTransaction,
        recordSupplierWalletPayment,
        companyBalanceTxns,
        getCompanyBalance,
        getTotalCompaniesBalance,
        addCompanyBalanceTxn,
        deleteCompanyBalanceTxn,
        openShift,
        closeShift,
        saveDraft,
        deleteDraft,
        updateCurrency,
        addStaff,
        updateStaff,
        deleteStaff,
        staffLogin,
        staffLogout,
        addPromotion,
        updatePromotion,
        deletePromotion,
        addStocktake,
        deleteStocktake,
        addAttachment,
        deleteAttachment,
        activateLicense,
        refreshLicense,
        updateSettings,
        resetAllData,
        seedDemoData,
        createBackup,
        restoreBackup,
        hasBackup,
        exportBackupFile,
        importBackupFile,
        uploadCloudBackup,
        listCloudBackups,
        restoreCloudBackup,
        deleteCloudBackup,
        addAuditEntry,
        clearAuditLog,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppData {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
