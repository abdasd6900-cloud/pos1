export interface PhoneNumberEntry {
  id: string;
  phoneNumber: string;
  simSerialNumber: string;
  companyName: string;
  subAgentName: string;
  customerName: string;
  customerPhone: string;
  lastTransactionAt: number | null;
  lastTransactionType: string | null;
  createdAt: number;
  updatedAt: number;
}

export type BusinessMode = 'retail' | 'telecom';

export type SimType = 'plastic' | 'electronic';

export type TelecomSaleMode = 'sell_sim' | 'charge_sim';

export type OperationType = 'activation' | 'renewal' | 'cancelled' | 'recharge';

export type FollowUpStatus = 'not_contacted' | 'contacted' | 'reminder_scheduled' | 'collected';

export type DebtReminderFrequency = 'daily' | 'weekly' | 'every_3_days' | 'every_5_days' | 'custom_days' | 'daily_until_paid';

export type EscalationPhase = 'none' | 'reminding' | 'awaiting_reply' | 'freeze_pending' | 'frozen' | 'reactivated';

export interface DebtEscalationState {
  saleId: string;
  customerName: string;
  customerPhone: string;
  simNumber: string;
  companyName: string;
  remaining: number;
  phase: EscalationPhase;
  remindersSent: number;
  maxRemindersBeforeFreeze: number;
  lastReminderAt: number | null;
  nextReminderAt: number | null;
  customerReplyDate: number | null;
  customerReplyText: string;
  awaitingReplySince: number | null;
  reactivationReason: string;
  createdAt: number;
  updatedAt: number;
}

export type FreezeRequestStatus = 'pending' | 'executed' | 'cancelled';

export interface FreezeRequest {
  id: string;
  saleId: string;
  customerName: string;
  customerPhone: string;
  simNumber: string;
  companyName: string;
  remaining: number;
  remindersSent: number;
  status: FreezeRequestStatus;
  executedAt: number | null;
  createdAt: number;
}

export type SupportTicketStatus = 'pending' | 'forwarded' | 'replied' | 'closed' | 'auto_forwarded' | 'recharged_by_support' | 'queued_off_hours' | 'update_done';

export interface SupportTicket {
  id: string;
  saleId: string | null;
  customerName: string;
  customerPhone: string;
  simNumber: string;
  companyName: string;
  companySupportPhone: string;
  originalMessage: string;
  supportMessage: string;
  status: SupportTicketStatus;
  whatsappOpened: boolean;
  customerReplySent: string | null;
  autoForwarded: boolean;
  forwardReason: 'timeout' | 'urgency' | 'manual' | 'internet_problem' | 'off_hours' | 'off_hours_shop_closed' | 'update_request' | 'update_not_working';
  rechargeConfirmedAt: number | null;
  queuedForSubAgentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AutoReplyTemplates {
  welcome: string;
  greeting: string;
  rechargeRequestReceived: string;
  rechargeRequestAskNumber: string;
  supportAcknowledgement: string;
  supportForwardMessage: string;
  rechargeConfirmed: string;
  urgencyDetected: string;
  offHoursMessage: string;
  transferNumbersMessage: string;
  transferRequestReply: string;
  esimAskPhoneModel: string;
  esimNotSupported: string;
  esimSupportedAskCompany: string;
  esimCompanyList: string;
  esimAskDuration: string;
  esimTransferToStaff: string;
  rechargeAccepted: string;
  specifyDuration: string;
  imageSimNumberRequest: string;
  voiceMessageReply: string;
  rechargeActiveReminder: string;
  rechargeInsistAccepted: string;
  updateRequestAskNumber: string;
  updateRequestDone: string;
  updateNotWorkingForwarded: string;
  updateConfirmDone: string;
  problemAskDetails: string;
  problemNoSignalUpdate: string;
  problemWeakInternet: string;
  simLookupActive: string;
  simLookupExpired: string;
  simLookupNotFound: string;
  rechargeCheckingProgress: string;
  rechargePendingClosed: string;
  updateExpiredSubscription: string;
}

export const DEFAULT_AUTO_REPLY_TEMPLATES: AutoReplyTemplates = {
  welcome: 'أهلاً وسهلاً بك {name}، متبقي في شريحتك عدد {days} يوم، كيف يمكنني مساعدتك؟',
  greeting: 'أهلاً وسهلاً بك في {storeName}، يسعدنا خدمتك. كيف يمكننا مساعدتك اليوم؟ (للشحن أرسل "شحن"، لطلب eSIM أرسل "eSIM"، لمعرفة أرقام التحويل أرسل "تحويل")',
  rechargeRequestReceived: 'تم استلام طلبك لتجديد الرقم {sim}، سيتم تنفيذه في أقرب وقت ممكن.',
  rechargeRequestAskNumber: 'يرجى إرسال رقم الشريحة أو الرقم المطلوب شحنه حتى نتمكن من تنفيذ طلبك.',
  supportAcknowledgement: 'سيتم متابعة طلبك خلال لحظات',
  supportForwardMessage: 'يعطيكم العافية يرجى شحن الرقم {sim} بعد اذنكم لم نتمكن من شحنه من طرفنا لضعف الانترنت',
  rechargeConfirmed: 'تم شحن الرقم {sim} بنجاح، شكراً لصبركم.',
  urgencyDetected: 'تم استلام رسالتك، سيتم تحويل طلبك للدعم الفني فوراً للمتابعة العاجلة.',
  offHoursMessage: 'عذراً، الشركة مغلقة حالياً ولا يمكن تنفيذ طلبك. سيتم تنفيذه مع بدء دوام الغد إن شاء الله.',
  transferNumbersMessage: '',
  transferRequestReply: 'شكراً لبلاغك عن التحويل. يرجى ذكر اسم المرسل والمبلغ المحوّل حتى نتمكن من مطابقتها مع إشعار البنك.',
  esimAskPhoneModel: 'مرحباً بك! للتحقق من إمكانية استخدام الشريحة الإلكترونية (eSIM)، يرجى إخبارنا بنوع جوالك (الموديل).',
  esimNotSupported: 'للأسف، جوالك لا يدعم الشريحة الإلكترونية (eSIM). أنت بحاجة إلى شريحة بلاستيك عادية. هل ترغب في طلب شريحة بلاستيك؟',
  esimSupportedAskCompany: 'ممتاز! جوالك يدعم الشريحة الإلكترونية. يرجى تحديد الشركة التي تريد الشريحة منها: سيلكوم، الوها، ويكم، بيلفون، رامي ليفي، هوت موبايل، 019، أو غيرها.',
  esimCompanyList: 'الشركات المتوفرة: سيلكوم، الوها، ويكم، بيلفون، رامي ليفي، هوت موبايل، 019. يرجى اختيار الشركة المناسبة لك.',
  esimAskDuration: 'يرجى تحديد مدة الشحن المطلوبة (شهر، شهرين، 3 شهور، أسبوع، إلخ).',
  esimTransferToStaff: 'تم تحويل المحادثة للموظف وسيتم الرد عليك خلال لحظات.',
  rechargeAccepted: 'تم استلام طلبك وسيتم إبلاغك حين تنفيذه، شكراً لصبركم.',
  specifyDuration: 'يرجى تحديد مدة الشحن المطلوبة (شهر، شهرين، إلخ) حتى نتمكن من تنفيذ طلبك.',
  imageSimNumberRequest: 'استلمنا صورتك، لكننا لا نستطيع قراءة الأرقام من الصور تلقائياً. يرجى كتابة رقم الشريحة كنص حتى نتمكن من تنفيذ طلبك.',
  voiceMessageReply: 'أنا مساعدة آلية ولا أستطيع الاستماع للرسائل الصوتية. يرجى كتابة ما تريد نصاً حتى أتمكن من مساعدتك.',
  rechargeActiveReminder: 'عزيزي {name}، لديك حالياً {days} يوم متبقية في اشتراكك الحالي. إذا كنت ترغب في التجديد رغم ذلك، يرجى إرسال "جدد" أو "ماشي جدد" وسنقوم بتنفيذ طلبك.',
  rechargeInsistAccepted: 'تم استلام طلبك بالتجديد رغم وجود أيام متبقية. سيتم تنفيذ طلبك في أقرب وقت ممكن.',
  updateRequestAskNumber: 'يرجى إرسال رقم الشريحة المراد تحديثها.',
  updateRequestDone: 'تم تحديث الرقم، يرجى إعادة تشغيل الجهاز بعد ربع ساعة.',
  updateNotWorkingForwarded: 'تم إرسال طلبك للدعم الفني وسيتم الرد عليك حين تلقي الرد.',
  updateConfirmDone: 'تم التحديث، يرجى إعادة التشغيل بعد 10 دقائق.',
  problemAskDetails: 'نأسف لما تواجهه. يرجى تحديد المشكلة:\n1. اختفاء اشارة النت\n2. اختفاء الارسال نهائياً\n3. ضعف في الانترنت',
  problemNoSignalUpdate: 'تم تحديث الرقم من طرفنا، يرجى إعادة تشغيل الجهاز بعد ربع ساعة.',
  problemWeakInternet: 'نأسف لمعاناتكم ونود اعلامكم ان الضعف ناتج عن تشويش على ابراج الارسال ولا يمكن التحكم في السرعه من طرفنا.\nملاحظه/ قد يكون هناك انواع اخرى من الشرائح تعمل في اماكنكم بشكل افضل بامكانك الاستفسار من جيرانك واصدقاءك عن انواع الشرائح المستخدمه في منطقتكم.\nتم تحديث الرقم من طرفنا قم باعادة التشغيل بعد ربع ساعه.\nشكرا لتفهمكم ونقدر صبركم',
  simLookupActive: 'عزيزي {name}، رقمك {sim} مسجل لدينا. متبقي في اشتراكك {days} يوم. اذا كنت ترغب بالتجديد ارسل "شحن" او "تجديد".',
  simLookupExpired: 'عزيزي {name}، رقمك {sim} مسجل لدينا لكن اشتراكك منتهي. لتجديد الاشتراك ارسل "شحن" او "تجديد".',
  simLookupNotFound: 'الرقم {sim} غير مسجل لدينا. اذا كنت ترغب بالشحن او التجديد، يرجى ارسال "شحن" متبوعاً بالرقم، او تواصل معنا لمساعدتك.',
  rechargeCheckingProgress: 'أهلاً وسهلاً بك، تم استلام رقمك وجاري فحصه الآن. سيتم إبلاغك بالنتيجة خلال لحظات.',
  rechargePendingClosed: 'تم استلام طلبك ووضعه على قائمة الانتظار. سيتم تنفيذه فور بدء الدوام في صباح الغد. شكراً لتفهمكم.',
  updateExpiredSubscription: 'عذراً، اشتراكك منتهي ولا يمكن تنفيذ التحديث. يلزم تجديد الاشتراك أولاً للتمتع بخدمة الانترنت. يرجى إرسال "شحن" أو "تجديد" مع رقم الشريحة.',
};

export interface TelecomCompany {
  id: string;
  name: string;
  color: string;
  supportPhone: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SimCard {
  id: string;
  companyId: string;
  companyName: string;
  type: SimType;
  name: string;
  barcode: string;
  cost: number;
  price: number;
  bundlePrice: number;
  stock: number;
  minStock: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Bundle {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  price: number;
  cost: number;
  description: string;
  durationDays: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentBundle {
  id: string;
  subAgentId: string;
  companyId: string;
  companyName: string;
  bundleName: string;
  bundleType?: 'monthly' | 'offer';
  offerType?: 'new_number' | 'renewal';
  active: boolean;
  prices: Record<string, number>;
  cost: number;
  createdAt: number;
  updatedAt: number;
}

export interface SimLocation {
  id: string;
  name: string;
  notes: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SimLocationStock {
  id: string;
  locationId: string;
  simCardId: string;
  companyId: string;
  companyName: string;
  simName: string;
  stock: number;
  createdAt: number;
  updatedAt: number;
}

export interface SubAgent {
  id: string;
  name: string;
  phone: string;
  companyIds: string[];
  balance: number;
  notes: string;
  active: boolean;
  rechargeEnabled: boolean;
  rechargeThreshold: number;
  rechargeAmount: number;
  supplierId: string | null;
  supplierPhone: string;
  scheduleEnabled: boolean;
  schedule: Record<WeekDay, BusinessDaySchedule>;
  createdAt: number;
  updatedAt: number;
}

export interface TelecomSupplier {
  id: string;
  name: string;
  phone: string;
  notes: string;
  workHoursEnabled: boolean;
  workHoursStart: string;
  workHoursEnd: string;
  workDays: number[];
  createdAt: number;
  updatedAt: number;
}

export interface Shipment {
  id: string;
  supplierId: string;
  supplierName: string;
  subAgentId: string;
  subAgentName: string;
  amount: number;
  notes: string;
  createdAt: number;
}

export type RechargeRequestStatus = 'pending' | 'sent' | 'confirmed' | 'cancelled';

export interface RechargeRequest {
  id: string;
  subAgentId: string;
  subAgentName: string;
  supplierId: string | null;
  supplierName: string;
  supplierPhone: string;
  amount: number;
  message: string;
  status: RechargeRequestStatus;
  smsSent: boolean;
  whatsappSent: boolean;
  createdAt: number;
  sentAt: number | null;
  confirmedAt: number | null;
}

export interface DebtReminderSchedule {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  frequency: DebtReminderFrequency;
  customDays: number;
  time: string;
  message: string;
  active: boolean;
  lastSent: number | null;
  nextSend: number | null;
  createdAt: number;
}

export interface TelecomSale {
  id: string;
  mode: TelecomSaleMode;
  operationType: OperationType;
  companyId: string;
  companyName: string;
  subAgentId: string;
  subAgentName: string;
  simType: SimType | null;
  simId: string | null;
  simName: string;
  simPrice: number;
  bundleId: string | null;
  bundleName: string;
  chargeDuration: string;
  simNumber: string;
  serialNumber: string;
  barcode: string;
  customerName: string;
  customerPhone: string;
  customerId: string | null;
  cost: number;
  salePrice: number;
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentDate: number | null;
  walletType: WalletType | null;
  reminderDate: number | null;
  debtChange: number;
  followUpStatus: FollowUpStatus;
  cancellationDeduction: number;
  cancelledAt: number | null;
  customerBalanceBefore: number;
  customerBalanceAfter: number;
  smsSent: boolean;
  reminderSet: boolean;
  reminderId: string | null;
  shiftId: string | null;
  staffId: string | null;
  staffName: string;
  notes: string;
  autoRenew: boolean;
  renewedFromId: string | null;
  carryoverDays: number;
  escalationState: DebtEscalationState | null;
  createdAt: number;
}

export const DEFAULT_TELECOM_COMPANIES: Omit<TelecomCompany, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'سيلكوم', color: '#E63946', supportPhone: '', active: true },
  { name: 'ويكم', color: '#2A9D8F', supportPhone: '', active: true },
  { name: 'بيلفون', color: '#F77F00', supportPhone: '', active: true },
  { name: 'رامي ليفي', color: '#7209B7', supportPhone: '', active: true },
  { name: 'باتنر', color: '#3A86FF', supportPhone: '', active: true },
  { name: 'هوت موبايل', color: '#FB5607', supportPhone: '', active: true },
  { name: '019', color: '#06A77D', supportPhone: '', active: true },
  { name: 'الوها', color: '#8338EC', supportPhone: '', active: true },
];

export const DEFAULT_TELECOM_BUNDLES: Omit<Bundle, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { companyId: 'tc_0', companyName: 'سيلكوم', name: 'حزمة 29', price: 29, cost: 25, description: 'حزمة شهرية - 29 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_0', companyName: 'سيلكوم', name: 'حزمة 50', price: 50, cost: 43, description: 'حزمة شهرية - 50 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_0', companyName: 'سيلكوم', name: 'حزمة 100', price: 100, cost: 88, description: 'حزمة شهرية - 100 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_0', companyName: 'سيلكوم', name: 'حزمة 200', price: 200, cost: 178, description: 'حزمة شهرية - 200 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_1', companyName: 'ويكم', name: 'حزمة 29', price: 29, cost: 25, description: 'حزمة شهرية - 29 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_1', companyName: 'ويكم', name: 'حزمة 50', price: 50, cost: 43, description: 'حزمة شهرية - 50 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_1', companyName: 'ويكم', name: 'حزمة 100', price: 100, cost: 88, description: 'حزمة شهرية - 100 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_2', companyName: 'بيلفون', name: 'حزمة 29', price: 29, cost: 25, description: 'حزمة شهرية - 29 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_2', companyName: 'بيلفون', name: 'حزمة 50', price: 50, cost: 43, description: 'حزمة شهرية - 50 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_2', companyName: 'بيلفون', name: 'حزمة 100', price: 100, cost: 88, description: 'حزمة شهرية - 100 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_2', companyName: 'بيلفون', name: 'حزمة 200', price: 200, cost: 178, description: 'حزمة شهرية - 200 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_3', companyName: 'رامي ليفي', name: 'حزمة 30', price: 30, cost: 26, description: 'حزمة شهرية - 30 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_3', companyName: 'رامي ليفي', name: 'حزمة 50', price: 50, cost: 43, description: 'حزمة شهرية - 50 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_3', companyName: 'رامي ليفي', name: 'حزمة 100', price: 100, cost: 88, description: 'حزمة شهرية - 100 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_4', companyName: 'باتنر', name: 'حزمة 29', price: 29, cost: 25, description: 'حزمة شهرية - 29 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_4', companyName: 'باتنر', name: 'حزمة 50', price: 50, cost: 43, description: 'حزمة شهرية - 50 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_4', companyName: 'باتنر', name: 'حزمة 100', price: 100, cost: 88, description: 'حزمة شهرية - 100 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_5', companyName: 'هوت موبايل', name: 'حزمة 29', price: 29, cost: 25, description: 'حزمة شهرية - 29 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_5', companyName: 'هوت موبايل', name: 'حزمة 50', price: 50, cost: 43, description: 'حزمة شهرية - 50 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_5', companyName: 'هوت موبايل', name: 'حزمة 100', price: 100, cost: 88, description: 'حزمة شهرية - 100 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_6', companyName: '019', name: 'حزمة 29', price: 29, cost: 25, description: 'حزمة شهرية - 29 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_6', companyName: '019', name: 'حزمة 50', price: 50, cost: 43, description: 'حزمة شهرية - 50 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_6', companyName: '019', name: 'حزمة 100', price: 100, cost: 88, description: 'حزمة شهرية - 100 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_7', companyName: 'الوها', name: 'حزمة 29', price: 29, cost: 25, description: 'حزمة شهرية - 29 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_7', companyName: 'الوها', name: 'حزمة 50', price: 50, cost: 43, description: 'حزمة شهرية - 50 شيكل', durationDays: 30, active: true },
  { companyId: 'tc_7', companyName: 'الوها', name: 'حزمة 100', price: 100, cost: 88, description: 'حزمة شهرية - 100 شيكل', durationDays: 30, active: true },
];

export type ThemeMode = 'light' | 'dark';

export type CustomerTier = 'regular' | 'vip';

export type PaymentMethod = 'cash' | 'debt' | 'wallet' | 'usdt' | 'balance';

// ============ Wallet / Treasury System ============
export type WalletType = 'cash' | 'bank_palestine' | 'palpay' | 'jawwal_pay' | 'jawwal_pay_merchant' | 'malchat';

export interface WalletTypeDef {
  id: WalletType;
  name: string;
  color: string;
}

export const WALLET_TYPES: WalletTypeDef[] = [
  { id: 'cash', name: 'نقدي', color: '#0E7C6B' },
  { id: 'bank_palestine', name: 'بنك فلسطين', color: '#1B5E9B' },
  { id: 'palpay', name: 'محفظة بال بي', color: '#E65100' },
  { id: 'jawwal_pay', name: 'محفظة جوال بي', color: '#6A1B9A' },
  { id: 'jawwal_pay_merchant', name: 'جوال بي (تاجر)', color: '#AD1457' },
  { id: 'malchat', name: 'محفظة مال شات', color: '#2E7D32' },
];

export const ELECTRONIC_WALLET_TYPES = WALLET_TYPES.filter((w) => w.id !== 'cash');

// ============ Recharge Company Balances ============
export type RechargeCompanyId = 'sky' | 'layan' | 'areen';

export interface RechargeCompanyDef {
  id: RechargeCompanyId;
  name: string;
  color: string;
}

export const RECHARGE_COMPANIES: RechargeCompanyDef[] = [
  { id: 'sky', name: 'سكاي', color: '#1565C0' },
  { id: 'layan', name: 'ليان', color: '#E65100' },
  { id: 'areen', name: 'أرين', color: '#2E7D32' },
];

export interface CompanyBalanceTxn {
  id: string;
  companyId: RechargeCompanyId;
  type: 'recharge_in' | 'recharge_out' | 'adjustment';
  amount: number;
  description: string;
  createdAt: number;
}

export type WalletTxnType = 'income' | 'expense' | 'transfer_in' | 'transfer_out' | 'supplier_payment' | 'sale' | 'adjustment';

export interface WalletTransaction {
  id: string;
  walletType: WalletType;
  type: WalletTxnType;
  amount: number;
  category: string;
  description: string;
  relatedTxnId: string | null;
  shiftId: string | null;
  createdAt: number;
}

export type PaymentStatus = 'paid_full' | 'paid_partial' | 'unpaid';

export type TransactionType = 'sale' | 'purchase' | 'payment' | 'return' | 'expense' | 'supplier_payment';

export type DebtAgeLevel = 'fresh' | 'warning' | 'critical';

export type AuditAction = 'create' | 'update' | 'delete' | 'sale' | 'return' | 'payment' | 'stock_adjust' | 'price_change' | 'login' | 'backup' | 'restore' | 'shift_open' | 'shift_close' | 'expense' | 'supplier_payment' | 'stocktake' | 'promotion';

export type StaffRole = 'manager' | 'cashier';

export type PromotionType = 'discount' | 'bogo' | 'bundle';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'locked';

export type LicensePlan = 'monthly' | 'yearly' | 'lifetime';

export interface LicenseInfo {
  deviceFingerprint: string;
  installDate: number;
  trialStartDate: number;
  trialDays: number;
  status: SubscriptionStatus;
  plan: LicensePlan | null;
  activatedAt: number | null;
  expiresAt: number | null;
  lastSeenTimestamp: number;
  activationKey: string | null;
  tamperDetected: boolean;
}

export interface ActivationResult {
  success: boolean;
  message: string;
  newExpiry: number | null;
}

export interface SplitPayment {
  cash: number;
  wallet: number;
  debt: number;
}

export interface SubUnit {
  name: string;
  factor: number;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  localBarcode: string;
  price: number;
  cost: number;
  stock: number;
  unit: string;
  subUnits: SubUnit[];
  minStock: number;
  category: string;
  expiryDate: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  tier: CustomerTier;
  debt: number;
  balance: number;
  creditLimit: number;
  discountPercent: number;
  notes: string;
  subscriptionNumber: string;
  subscriptionExpiry: number | null;
  loyaltyPoints: number;
  createdAt: number;
  updatedAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  company: string;
  balance: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  cost: number;
  quantity: number;
  unit: string;
}

export interface DraftBill {
  id: string;
  cart: CartItem[];
  customerId: string | null;
  customerName: string;
  discountPercent: number;
  total: number;
  note: string;
  createdAt: number;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  shiftId: string | null;
  walletType: WalletType;
  createdAt: number;
}

export interface Shift {
  id: string;
  openedAt: number;
  closedAt: number | null;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  status: 'open' | 'closed';
  staffId: string | null;
  staffName: string;
  note: string;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

export interface Staff {
  id: string;
  name: string;
  pin: string;
  role: StaffRole;
  active: boolean;
  canDelete: boolean;
  canEditPrice: boolean;
  canDiscount: boolean;
  maxDiscountPercent: number;
  canProcessReturn: boolean;
  createdAt: number;
}

export interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  value: number;
  category: string;
  buyQty: number;
  freeQty: number;
  startDate: number;
  endDate: number;
  active: boolean;
}

export interface StocktakeItem {
  productId: string;
  productName: string;
  expectedQty: number;
  actualQty: number;
  difference: number;
}

export interface Stocktake {
  id: string;
  items: StocktakeItem[];
  staffId: string | null;
  staffName: string;
  createdAt: number;
}

export interface Attachment {
  id: string;
  txnId: string | null;
  customerId: string | null;
  type: 'photo' | 'signature';
  dataUrl: string;
  label: string;
  createdAt: number;
}

export interface SmartAlert {
  id: string;
  type: 'debt' | 'expiry' | 'low_stock' | 'shift';
  title: string;
  message: string;
  entityId: string;
  severity: 'info' | 'warning' | 'danger';
  createdAt: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  customerId: string | null;
  customerName: string;
  supplierId: string | null;
  supplierName: string;
  items: CartItem[];
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: PaymentMethod;
  splitPayment: SplitPayment | null;
  debtChange: number;
  loyaltyEarned: number;
  note: string;
  smsSent: boolean;
  returnReason: string;
  originalTxnId: string | null;
  currencyCode: string;
  shiftId: string | null;
  staffId: string | null;
  staffName: string;
  promotionApplied: string | null;
  discountAmount: number;
  walletType: WalletType | null;
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  description: string;
  user: string;
  timestamp: number;
}

export interface Settings {
  businessMode: BusinessMode;
  theme: ThemeMode;
  storeName: string;
  currency: string;
  ownerName: string;
  phone: string;
  enableSms: boolean;
  enableVipDiscount: boolean;
  taxRate: number;
  pinEnabled: boolean;
  ownerPin: string;
  smsTemplate: string;
  enableExpiryAlerts: boolean;
  expiryAlertDays: number;
  enableLoyalty: boolean;
  loyaltyRate: number;
  enableVoiceSearch: boolean;
  enableStockPrediction: boolean;
  enablePeakMode: boolean;
  enableDraftBills: boolean;
  enableShiftManagement: boolean;
  enableExpenses: boolean;
  enableMultiCurrency: boolean;
  enableAutoLock: boolean;
  autoLockMinutes: number;
  enableQrReceipt: boolean;
  defaultCurrencyCode: string;
  supplierPaymentDueDays: number;
  enableStaffManagement: boolean;
  enablePromotions: boolean;
  enableStocktake: boolean;
  enableAttachments: boolean;
  enableSmartAlerts: boolean;
  requireManagerForDiscount: boolean;
  requireManagerForDelete: boolean;
  requireManagerForReturn: boolean;
  globalMaxDiscountPercent: number;
  trialDays: number;
  enableLicenseSystem: boolean;
  enableBusinessHours: boolean;
  enableAutoResponder: boolean;
  enableSmsMonitoring: boolean;
  enableWhatsappMonitoring: boolean;
  enableTransferDetection: boolean;
  enableScreenshotDetection: boolean;
  autoReplyTemplates: AutoReplyTemplates;
  autoForwardTimeoutMinutes: number;
  receiptLogo: string;
  receiptHeaderText: string;
  receiptFooterText: string;
  enableAutoBackup: boolean;
  enableSmsInbox: boolean;
}

export interface DashboardStats {
  todaySales: number;
  todayProfit: number;
  totalDebt: number;
  totalProducts: number;
  lowStockCount: number;
  todayTransactions: number;
  totalCustomers: number;
  todayExpenses: number;
  totalSuppliersBalance: number;
  expiringProductsCount: number;
  oldDebtsCount: number;
}

export interface StockPrediction {
  productId: string;
  productName: string;
  currentStock: number;
  dailyRate: number;
  daysUntilEmpty: number | null;
  urgency: 'safe' | 'soon' | 'critical';
  recommendation: string;
}

export const DEFAULT_SMS_TEMPLATE =
  'عزيزي العميل {name}،\nتم تجديد اشتراك رقم {sub} بنجاح.\nالمبلغ: {amount}\nالمتبقي من الدين: {debt}\nشكراً لكم';

export const EXPENSE_CATEGORIES = [
  'إيجار',
  'كهرباء وماء',
  'أجور نقل',
  'ضيافة',
  'صيانة',
  'مشتريات نثرية',
  'رواتب',
  'أخرى',
];

export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BusinessDaySchedule {
  enabled: boolean;
  openTime: string;
  closeTime: string;
}

export interface BusinessHoursConfig {
  autoMode: boolean;
  days: Record<WeekDay, BusinessDaySchedule>;
  enableDnd: boolean;
  enableAutoReply: boolean;
  enableCallRejection: boolean;
  closedMessage: string;
  openMessage: string;
  autoReplyCooldownMinutes: number;
}

export interface KeywordReply {
  id: string;
  keywords: string[];
  reply: string;
  active: boolean;
  createdAt: number;
}

export type UnrecognizedMessageStatus = 'pending' | 'learned' | 'ignored';

export type LearnedSmsCategory = 'recharge' | 'update' | 'problem' | 'transfer' | 'normal';

export interface UnrecognizedMessage {
  id: string;
  senderPhone: string;
  senderName: string;
  originalMessage: string;
  status: UnrecognizedMessageStatus;
  learnedReply: string | null;
  learnedKeywords: string[];
  learnedCategory: LearnedSmsCategory | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface LearnedSmsRule {
  id: string;
  category: LearnedSmsCategory;
  keywords: string[];
  senderPhone: string | null;
  reply: string | null;
  active: boolean;
  createdAt: number;
  matchCount: number;
}

export type PendingOperationSource = 'sms' | 'whatsapp' | 'manual';
export type PendingOperationStatus = 'pending' | 'executed' | 'cancelled';

export interface PendingOperation {
  id: string;
  source: PendingOperationSource;
  senderPhone: string;
  senderName: string;
  simNumber: string;
  originalMessage: string;
  status: PendingOperationStatus;
  customerMatched: boolean;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  companyGuess: string;
  bundleGuess: string;
  createdAt: number;
  executedAt: number | null;
  transferReportId: string | null;
  transferNotificationId: string | null;
  transferStatus: 'none' | 'reported_not_detected' | 'reported_with_receipt' | 'matched' | 'confirmed';
  chargeDuration: string | null;
  companyName: string | null;
}

// ============ Transfer Notification System ============

export type TransferNotificationStatus = 'unmatched' | 'matched' | 'confirmed' | 'rejected' | 'expired';
export type TransferReportSource = 'sms' | 'whatsapp' | 'manual';
export type TransferReportStatus = 'reported_not_detected' | 'reported_with_receipt' | 'matched' | 'confirmed' | 'rejected';

export interface TransferNotification {
  id: string;
  rawSms: string;
  senderName: string;
  senderPhone: string;
  senderNameNormalized: string[];
  amount: number;
  currency: string;
  bankName: string;
  reference: string;
  receivedAt: number;
  status: TransferNotificationStatus;
  matchedPendingOpId: string | null;
  matchedTransferReportId: string | null;
  matchedSaleId: string | null;
  matchedCustomerId: string | null;
  confirmedAt: number | null;
  confirmedBy: string | null;
  rejectedReason: string;
  createdAt: number;
}

export interface TransferReport {
  id: string;
  pendingOpId: string | null;
  saleId: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  simNumber: string;
  source: TransferReportSource;
  reportedAmount: number | null;
  reportedSenderName: string;
  reportedSenderNameNormalized: string[];
  hasReceipt: boolean;
  receiptImageUrl: string | null;
  status: TransferReportStatus;
  matchedNotificationId: string | null;
  originalMessage: string;
  createdAt: number;
  resolvedAt: number | null;
}

export interface NameMapping {
  id: string;
  fromName: string;
  fromNameNormalized: string;
  toCustomerId: string | null;
  toCustomerName: string;
  toCustomerPhone: string;
  confirmedCount: number;
  createdAt: number;
  updatedAt: number;
}

export type SmsMessageCategory = 'transaction' | 'esim' | 'general';
export type SmsMessageDirection = 'inbound' | 'outbound';
export type SmsMessageStatus = 'new' | 'read' | 'processed' | 'ignored';
export type SmsProcessAction = 'none' | 'pending_op' | 'transfer_notification' | 'unrecognized' | 'support_ticket';
export type SmsSendStatus = 'none' | 'pending' | 'sent' | 'delivered' | 'failed';

export interface QuickReplyTemplate {
  id: string;
  label: string;
  body: string;
  createdAt: number;
}

export interface ScheduledSms {
  id: string;
  phone: string;
  message: string;
  scheduledAt: number;
  subscriptionId: number | null;
  sent: boolean;
  createdAt: number;
}

export interface SmsMessage {
  id: string;
  direction: SmsMessageDirection;
  senderPhone: string;
  senderName: string;
  body: string;
  category: SmsMessageCategory;
  status: SmsMessageStatus;
  processAction: SmsProcessAction;
  linkedPendingOpId: string | null;
  linkedTransferNotificationId: string | null;
  linkedSupportTicketId: string | null;
  linkedUnrecognizedMsgId: string | null;
  autoReplied: boolean;
  autoReplyText: string | null;
  timestamp: number;
  readAt: number | null;
  sendStatus: SmsSendStatus;
  outboxEventId: string | null;
}

export interface SkyRechargeLog {
  id: string;
  phoneNumber: string;
  durationKey: string;
  success: boolean;
  error: string | null;
  url: string | null;
  executedAt: number;
}

export const DEFAULT_CURRENCIES: Currency[] = [
  { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س', rate: 1 },
  { code: 'USD', name: 'دولار أمريكي', symbol: '$', rate: 3.75 },
  { code: 'JOD', name: 'دينار أردني', symbol: 'د.أ', rate: 5.27 },
  { code: 'ILS', name: 'شيكل إسرائيلي', symbol: '₪', rate: 1.03 },
  { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م', rate: 8.65 },
];
