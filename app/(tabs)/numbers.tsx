import { useMemo, useState, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, TextInput, ScrollView,
  Platform, useWindowDimensions, Alert,
} from 'react-native';
import {
  Search, Download, Upload, FileSpreadsheet, Link2, Pencil, Trash2,
  Phone, CreditCard, Building2, User, Clock, Plus, ChevronDown, X,
} from 'lucide-react-native';
import * as XLSX from 'xlsx';
import { useTheme } from '@/lib/theme-context';
import { useApp } from '@/lib/app-context';
import { formatDateTime } from '@/lib/format';
import { exportXlsx, pickExcelFile, readPickedExcel } from '@/lib/xlsx-export';
import type { ColumnMapping } from '@/lib/excel-import';
import type { PhoneNumberEntry } from '@/types';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';

const PHONE_NUMBER_MAPPINGS: ColumnMapping[] = [
  { field: 'phoneNumber', keywords: ['رقم الهاتف', 'الهاتف', 'الرقم', 'phone', 'number', 'mobile'], type: 'text', required: true },
  { field: 'simSerialNumber', keywords: ['رقم الشريحة', 'الشريحة', 'ICCID', 'sim', 'serial'], type: 'text' },
  { field: 'companyName', keywords: ['الشركة', 'شركة', 'company'], type: 'text' },
  { field: 'subAgentName', keywords: ['الوكيل', 'وكيل', 'agent', 'subagent'], type: 'text' },
  { field: 'customerName', keywords: ['اسم الزبون', 'الزبون', 'العميل', 'اسم', 'customer', 'name', 'client'], type: 'text' },
  { field: 'customerPhone', keywords: ['رقم الزبون', 'جوال الزبون', 'هاتف الزبون', 'customer phone', 'customer mobile'], type: 'text' },
];

type SortKey = 'newest' | 'oldest' | 'company' | 'agent';

interface FormData {
  phoneNumber: string;
  simSerialNumber: string;
  companyName: string;
  subAgentName: string;
  customerName: string;
  customerPhone: string;
}

const EMPTY_FORM: FormData = {
  phoneNumber: '', simSerialNumber: '', companyName: '',
  subAgentName: '', customerName: '', customerPhone: '',
};

export default function NumbersScreen() {
  const { colors } = useTheme();
  const { phoneNumbers, telecomSales, addPhoneNumber, updatePhoneNumber, deletePhoneNumber, linkPhoneNumbersToTransactions } = useApp();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 900;

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PhoneNumberEntry | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [showImportResult, setShowImportResult] = useState(false);
  const [linkResult, setLinkResult] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openAddForm = () => {
    setEditingEntry(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  const openEditForm = (entry: PhoneNumberEntry) => {
    setEditingEntry(entry);
    setFormData({
      phoneNumber: entry.phoneNumber,
      simSerialNumber: entry.simSerialNumber,
      companyName: entry.companyName,
      subAgentName: entry.subAgentName,
      customerName: entry.customerName,
      customerPhone: entry.customerPhone,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingEntry(null);
    setFormData(EMPTY_FORM);
  };

  const handleSave = () => {
    const trimmed: FormData = {
      phoneNumber: formData.phoneNumber.trim(),
      simSerialNumber: formData.simSerialNumber.trim(),
      companyName: formData.companyName.trim(),
      subAgentName: formData.subAgentName.trim(),
      customerName: formData.customerName.trim(),
      customerPhone: formData.customerPhone.trim(),
    };
    if (!trimmed.phoneNumber) return;

    if (editingEntry) {
      updatePhoneNumber(editingEntry.id, {
        ...trimmed,
        lastTransactionAt: editingEntry.lastTransactionAt,
        lastTransactionType: editingEntry.lastTransactionType,
      });
    } else {
      addPhoneNumber({
        ...trimmed,
        lastTransactionAt: null,
        lastTransactionType: null,
      });
    }
    closeForm();
  };

  const mergedNumbers = useMemo(() => {
    const byPhone = new Map<string, PhoneNumberEntry & { bundleName?: string; operationType?: string }>();
    // Start with manually-added entries
    for (const e of phoneNumbers) {
      byPhone.set(e.phoneNumber, { ...e });
    }
    // Merge in numbers from telecom sales that aren't already added
    for (const s of telecomSales) {
      if (!s.simNumber) continue;
      const existing = byPhone.get(s.simNumber);
      if (existing) {
        // Enrich with sale data if missing
        if (!existing.companyName) existing.companyName = s.companyName;
        if (!existing.subAgentName) existing.subAgentName = s.subAgentName;
        if (!existing.customerName) existing.customerName = s.customerName;
        if (!existing.customerPhone) existing.customerPhone = s.customerPhone;
        if (!existing.simSerialNumber) existing.simSerialNumber = s.serialNumber || '';
        existing.bundleName = s.bundleName || existing.bundleName;
        // Update last transaction if this sale is newer
        if (!existing.lastTransactionAt || s.createdAt > existing.lastTransactionAt) {
          existing.lastTransactionAt = s.createdAt;
          existing.lastTransactionType = s.operationType;
          existing.bundleName = s.bundleName || existing.bundleName;
        }
      } else {
        byPhone.set(s.simNumber, {
          id: `sale-${s.id}`,
          phoneNumber: s.simNumber,
          simSerialNumber: s.serialNumber || '',
          companyName: s.companyName,
          subAgentName: s.subAgentName,
          customerName: s.customerName,
          customerPhone: s.customerPhone,
          lastTransactionAt: s.createdAt,
          lastTransactionType: s.operationType,
          bundleName: s.bundleName || '',
          createdAt: s.createdAt,
          updatedAt: s.createdAt,
        });
      }
    }
    return Array.from(byPhone.values());
  }, [phoneNumbers, telecomSales]);

  const filtered = useMemo(() => {
    let result = mergedNumbers;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((e) =>
        e.phoneNumber.toLowerCase().includes(q) ||
        e.simSerialNumber.toLowerCase().includes(q) ||
        e.companyName.toLowerCase().includes(q) ||
        e.subAgentName.toLowerCase().includes(q) ||
        e.customerName.toLowerCase().includes(q) ||
        e.customerPhone.toLowerCase().includes(q) ||
        (e.bundleName ?? '').toLowerCase().includes(q)
      );
    }
    const sorted = [...result];
    switch (sortKey) {
      case 'oldest': sorted.sort((a, b) => a.createdAt - b.createdAt); break;
      case 'company': sorted.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ar')); break;
      case 'agent': sorted.sort((a, b) => a.subAgentName.localeCompare(b.subAgentName, 'ar')); break;
      default: sorted.sort((a, b) => b.createdAt - a.createdAt);
    }
    return sorted;
  }, [mergedNumbers, search, sortKey]);

  const sortLabels: Record<SortKey, string> = {
    newest: 'الأحدث',
    oldest: 'الأقدم',
    company: 'حسب الشركة',
    agent: 'حسب الوكيل',
  };
  const sortOptions: SortKey[] = ['newest', 'oldest', 'company', 'agent'];

  const handleExportFull = useCallback(() => {
    const ws = XLSX.utils.json_to_sheet(
      mergedNumbers.map((e) => ({
        'رقم الهاتف': e.phoneNumber,
        'رقم الشريحة': e.simSerialNumber,
        'الشركة': e.companyName,
        'الوكيل': e.subAgentName,
        'الحزمة': e.bundleName || '',
        'اسم الزبون': e.customerName,
        'رقم الزبون': e.customerPhone,
        'آخر معاملة': e.lastTransactionAt ? formatDateTime(e.lastTransactionAt) : '',
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الأرقام');
    void exportXlsx(wb, 'كشف_الأرقام.xlsx');
  }, [mergedNumbers]);

  const handleExportTemplate = useCallback(() => {
    const ws = XLSX.utils.json_to_sheet([
      { 'رقم الهاتف': '', 'رقم الشريحة': '', 'الشركة': '', 'الوكيل': '', 'اسم الزبون': '', 'رقم الزبون': '' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'القالب');
    void exportXlsx(wb, 'قالب_الأرقام.xlsx');
  }, []);

  const processImportRows = (rows: unknown[][]) => {
    if (rows.length < 2) {
      setImportResult({ added: 0, skipped: 0, errors: ['الملف فارغ'] });
      setShowImportResult(true);
      return;
    }
    const headerRow = rows[0] as string[];
    const colToField: (string | null)[] = headerRow.map((h) => {
      const match = PHONE_NUMBER_MAPPINGS.find((m) => m.keywords.some((k) => String(h).toLowerCase().trim().includes(k.toLowerCase())));
      return match?.field ?? null;
    });

    if (!colToField.includes('phoneNumber')) {
      setImportResult({ added: 0, skipped: 0, errors: ['لم يتم العثور على عمود رقم الهاتف'] });
      setShowImportResult(true);
      return;
    }

    let added = 0;
    let skipped = 0;
    const existingPhones = new Set(phoneNumbers.map((e) => e.phoneNumber));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const entry: Record<string, string> = {};
      for (let c = 0; c < colToField.length; c++) {
        const field = colToField[c];
        if (!field) continue;
        entry[field] = String(row[c] ?? '').trim();
      }
      if (!entry.phoneNumber) { skipped++; continue; }
      if (existingPhones.has(entry.phoneNumber)) { skipped++; continue; }
      existingPhones.add(entry.phoneNumber);

      const lastSale = telecomSales.find((s) => s.simNumber === entry.phoneNumber);
      addPhoneNumber({
        phoneNumber: entry.phoneNumber,
        simSerialNumber: entry.simSerialNumber || '',
        companyName: entry.companyName || lastSale?.companyName || '',
        subAgentName: entry.subAgentName || lastSale?.subAgentName || '',
        customerName: entry.customerName || lastSale?.customerName || '',
        customerPhone: entry.customerPhone || lastSale?.customerPhone || '',
        lastTransactionAt: lastSale?.createdAt ?? null,
        lastTransactionType: lastSale?.operationType ?? null,
      });
      added++;
    }
    setImportResult({ added, skipped, errors: [] });
    setShowImportResult(true);
  };

  const handleImportClick = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      void handleImportMobile();
    }
  };

  const handleImportMobile = async () => {
    const file = await pickExcelFile();
    if (!file) return;
    try {
      const wb = await readPickedExcel(file);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      processImportRows(data as unknown[][]);
    } catch {
      setImportResult({ added: 0, skipped: 0, errors: ['تعذر قراءة الملف'] });
      setShowImportResult(true);
    }
  };

  const handleWebFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        processImportRows(data as unknown[][]);
      } catch {
        setImportResult({ added: 0, skipped: 0, errors: ['تعذر قراءة الملف'] });
        setShowImportResult(true);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleLink = () => {
    const count = linkPhoneNumbersToTransactions();
    setLinkResult(count);
    setTimeout(() => setLinkResult(null), 3000);
  };

  const handleDelete = (entry: PhoneNumberEntry & { bundleName?: string }) => {
    // Only allow deleting manually-added entries (not sale-derived ones)
    if (entry.id.startsWith('sale-')) return;
    if (Platform.OS === 'web') {
      if (window.confirm(`حذف الرقم ${entry.phoneNumber}؟`)) {
        deletePhoneNumber(entry.id);
      }
    } else {
      Alert.alert('تأكيد الحذف', `حذف الرقم ${entry.phoneNumber}؟`, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => deletePhoneNumber(entry.id) },
      ]);
    }
  };

  const lastTransactionLabel = (entry: PhoneNumberEntry): string => {
    if (!entry.lastTransactionAt) return '-';
    const typeLabels: Record<string, string> = {
      activation: 'تفعيل', renewal: 'تجديد', recharge: 'شحن', cancelled: 'إلغاء',
    };
    return `${typeLabels[entry.lastTransactionType ?? ''] ?? 'معاملة'} - ${formatDateTime(entry.lastTransactionAt)}`;
  };

  const updateForm = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleWebFileChange}
        />
      )}

      <View style={[styles.toolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث شامل..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={16} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => setShowSortMenu((v) => !v)}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>{sortLabels[sortKey]}</Text>
            <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
          {showSortMenu && (
            <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {sortOptions.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => { setSortKey(opt); setShowSortMenu(false); }}
                  style={[styles.dropdownItem, sortKey === opt && { backgroundColor: colors.primary + '15' }]}
                >
                  <Text style={[styles.dropdownItemText, { color: sortKey === opt ? colors.primary : colors.text }]}>
                    {sortLabels[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity onPress={handleExportTemplate} style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} activeOpacity={0.7}>
            <FileSpreadsheet size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>قالب</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleExportFull} style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} activeOpacity={0.7}>
            <Download size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>تصدير</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleImportClick} style={[styles.actionBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]} activeOpacity={0.7}>
            <Upload size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>استيراد</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLink} style={[styles.actionBtn, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' }]} activeOpacity={0.7}>
            <Link2 size={16} color={colors.accent} strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: colors.accent }]}>ربط</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={openAddForm} style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} activeOpacity={0.7}>
            <Plus size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>إضافة</Text>
          </TouchableOpacity>
        </View>
      </View>

      {linkResult !== null && (
        <View style={[styles.banner, { backgroundColor: colors.success + '15' }]}>
          <Text style={[styles.bannerText, { color: colors.success }]}>
            تم ربط {linkResult} رقم بالمعاملات
          </Text>
        </View>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Phone size={48} color={colors.textMuted} strokeWidth={1.5} />}
          title="لا توجد أرقام"
          subtitle="ابدأ بإضافة رقم أو استيراد كشف من Excel"
        />
      ) : isDesktop ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <View style={[styles.tableHeader, { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.border }]}>
            <Text style={[styles.colHeader, styles.colPhone, { color: colors.textSecondary, borderLeftColor: colors.border }]}>رقم الهاتف</Text>
            <Text style={[styles.colHeader, styles.colSim, { color: colors.textSecondary, borderLeftColor: colors.border }]}>رقم الشريحة</Text>
            <Text style={[styles.colHeader, styles.colCompany, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الشركة</Text>
            <Text style={[styles.colHeader, styles.colAgent, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الوكيل</Text>
            <Text style={[styles.colHeader, styles.colBundle, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الحزمة</Text>
            <Text style={[styles.colHeader, styles.colCustomer, { color: colors.textSecondary, borderLeftColor: colors.border }]}>اسم الزبون</Text>
            <Text style={[styles.colHeader, styles.colPhone, { color: colors.textSecondary, borderLeftColor: colors.border }]}>رقم الزبون</Text>
            <Text style={[styles.colHeader, styles.colLastTxn, { color: colors.textSecondary, borderLeftColor: colors.border }]}>آخر معاملة</Text>
            <Text style={[styles.colHeader, styles.colActions, { color: colors.textSecondary }]}>إجراءات</Text>
          </View>
          {filtered.map((entry) => (
            <View key={entry.id} style={[styles.tableRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <Text style={[styles.colBody, styles.colPhone, { color: colors.text, borderLeftColor: colors.border }]}>{entry.phoneNumber}</Text>
              <Text style={[styles.colBody, styles.colSim, { color: colors.textSecondary, borderLeftColor: colors.border }]}>{entry.simSerialNumber || '-'}</Text>
              <Text style={[styles.colBody, styles.colCompany, { color: colors.text, borderLeftColor: colors.border }]}>{entry.companyName || '-'}</Text>
              <Text style={[styles.colBody, styles.colAgent, { color: colors.textSecondary, borderLeftColor: colors.border }]}>{entry.subAgentName || '-'}</Text>
              <Text style={[styles.colBody, styles.colBundle, { color: colors.textSecondary, borderLeftColor: colors.border }]}>{entry.bundleName || '-'}</Text>
              <Text style={[styles.colBody, styles.colCustomer, { color: colors.text, borderLeftColor: colors.border }]}>{entry.customerName || '-'}</Text>
              <Text style={[styles.colBody, styles.colPhone, { color: colors.textSecondary, borderLeftColor: colors.border }]}>{entry.customerPhone || '-'}</Text>
              <Text style={[styles.colBody, styles.colLastTxn, { color: colors.textMuted, borderLeftColor: colors.border }]} numberOfLines={1}>{lastTransactionLabel(entry)}</Text>
              <View style={[styles.colBody, styles.colActions, { borderLeftColor: colors.border }]}>
                <View style={styles.rowActions}>
                  {!entry.id.startsWith('sale-') && (
                    <TouchableOpacity onPress={() => openEditForm(entry)} style={styles.iconBtn}>
                      <Pencil size={16} color={colors.accent} strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                  {!entry.id.startsWith('sale-') && (
                    <TouchableOpacity onPress={() => handleDelete(entry)} style={styles.iconBtn}>
                      <Trash2 size={16} color={colors.danger} strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
          {filtered.map((entry) => (
            <View key={entry.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardPhoneRow}>
                  <Phone size={16} color={colors.primary} strokeWidth={2} />
                  <Text style={[styles.cardPhone, { color: colors.text }]}>{entry.phoneNumber}</Text>
                </View>
                <View style={styles.rowActions}>
                  {!entry.id.startsWith('sale-') && (
                    <TouchableOpacity onPress={() => openEditForm(entry)} style={styles.iconBtn}>
                      <Pencil size={16} color={colors.accent} strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                  {!entry.id.startsWith('sale-') && (
                    <TouchableOpacity onPress={() => handleDelete(entry)} style={styles.iconBtn}>
                      <Trash2 size={16} color={colors.danger} strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.cardBody}>
                <CardRow icon={<CreditCard size={14} color={colors.textMuted} strokeWidth={2} />} label="الشريحة" value={entry.simSerialNumber || '-'} colors={colors} />
                <CardRow icon={<Building2 size={14} color={colors.textMuted} strokeWidth={2} />} label="الشركة" value={entry.companyName || '-'} colors={colors} />
                {entry.bundleName ? <CardRow icon={<CreditCard size={14} color={colors.textMuted} strokeWidth={2} />} label="الحزمة" value={entry.bundleName} colors={colors} /> : null}
                <CardRow icon={<User size={14} color={colors.textMuted} strokeWidth={2} />} label="الزبون" value={`${entry.customerName || '-'}${entry.customerPhone ? ' / ' + entry.customerPhone : ''}`} colors={colors} />
                <CardRow icon={<Clock size={14} color={colors.textMuted} strokeWidth={2} />} label="آخر معاملة" value={lastTransactionLabel(entry)} colors={colors} />
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <BaseModal
        visible={showForm}
        onClose={closeForm}
        title={editingEntry ? 'تعديل رقم' : 'إضافة رقم'}
        footer={
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnText}>حفظ</Text>
          </TouchableOpacity>
        }
      >
        <View style={{ gap: 12 }}>
          <FormInput label="رقم الهاتف" value={formData.phoneNumber} onChangeText={(v) => updateForm('phoneNumber', v)} colors={colors} required />
          <FormInput label="رقم الشريحة" value={formData.simSerialNumber} onChangeText={(v) => updateForm('simSerialNumber', v)} colors={colors} />
          <FormInput label="الشركة" value={formData.companyName} onChangeText={(v) => updateForm('companyName', v)} colors={colors} />
          <FormInput label="الوكيل" value={formData.subAgentName} onChangeText={(v) => updateForm('subAgentName', v)} colors={colors} />
          <FormInput label="اسم الزبون" value={formData.customerName} onChangeText={(v) => updateForm('customerName', v)} colors={colors} />
          <FormInput label="رقم الزبون" value={formData.customerPhone} onChangeText={(v) => updateForm('customerPhone', v)} colors={colors} />
        </View>
      </BaseModal>

      <BaseModal
        visible={showImportResult}
        onClose={() => setShowImportResult(false)}
        title="نتيجة الاستيراد"
        footer={
          <TouchableOpacity onPress={() => setShowImportResult(false)} style={[styles.confirmBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
            <Text style={styles.confirmBtnText}>تم</Text>
          </TouchableOpacity>
        }
      >
        <View style={{ gap: 10 }}>
          <Text style={[styles.resultText, { color: colors.text }]}>تم إضافة: {importResult?.added ?? 0}</Text>
          <Text style={[styles.resultText, { color: colors.textSecondary }]}>تم تخطي: {importResult?.skipped ?? 0}</Text>
          {importResult?.errors.map((err, i) => (
            <Text key={i} style={[styles.resultText, { color: colors.danger }]}>{err}</Text>
          ))}
        </View>
      </BaseModal>
    </View>
  );
}

function FormInput({ label, value, onChangeText, colors, required }: {
  label: string; value: string; onChangeText: (v: string) => void;
  colors: ReturnType<typeof useTheme>['colors']; required?: boolean;
}) {
  return (
    <View>
      <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
        {label}{required ? ' *' : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.formInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
        placeholder={label}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

function CardRow({ icon, label, value, colors }: {
  icon: React.ReactNode; label: string; value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.cardRow}>
      {icon}
      <Text style={[styles.cardRowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.cardRowValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, height: 40, borderRadius: 10,
    borderWidth: 1, flex: 1, minWidth: 200,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Cairo-Regular' },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, height: 36, borderRadius: 9, borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontFamily: 'Cairo-SemiBold' },
  dropdown: {
    position: 'absolute', top: 42, right: 0, minWidth: 140,
    borderRadius: 10, borderWidth: 1, padding: 4, zIndex: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 7 },
  dropdownItemText: { fontSize: 13, fontFamily: 'Cairo-SemiBold' },
  banner: { paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  bannerText: { fontSize: 14, fontFamily: 'Cairo-SemiBold' },
  tableHeader: { flexDirection: 'row', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  colHeader: { fontSize: 12, fontFamily: 'Cairo-Bold', paddingHorizontal: 8, borderLeftWidth: 1 },
  colBody: { fontSize: 13, fontFamily: 'Cairo-Regular', paddingHorizontal: 8, paddingVertical: 2, borderLeftWidth: 1 },
  colPhone: { flex: 1.2 },
  colSim: { flex: 1.2 },
  colCompany: { flex: 1 },
  colAgent: { flex: 1 },
  colBundle: { flex: 1 },
  colCustomer: { flex: 1 },
  colLastTxn: { flex: 1.5 },
  colActions: { flex: 0.8, justifyContent: 'center' },
  rowActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 4, borderRadius: 6 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardPhone: { fontSize: 16, fontFamily: 'Cairo-Bold' },
  cardBody: { gap: 6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardRowLabel: { fontSize: 12, fontFamily: 'Cairo-Regular', width: 70 },
  cardRowValue: { fontSize: 13, fontFamily: 'Cairo-SemiBold', flex: 1 },
  formLabel: { fontSize: 13, fontFamily: 'Cairo-SemiBold', marginBottom: 4 },
  formInput: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontFamily: 'Cairo-Regular' },
  confirmBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontSize: 16, fontFamily: 'Cairo-Bold', color: '#FFFFFF' },
  resultText: { fontSize: 14, fontFamily: 'Cairo-Regular' },
});
