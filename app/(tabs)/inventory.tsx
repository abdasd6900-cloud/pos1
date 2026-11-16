import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, FlatList, Platform } from 'react-native';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package, Plus, Search, Trash2, Pencil, AlertTriangle,
  Boxes, Tag, X, Upload, Download, FileSpreadsheet, Check, Info,
} from 'lucide-react-native';
import * as XLSX from 'xlsx';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Product , SubUnit } from '@/types';
import { OmniSearchBar } from '@/components/OmniSearchBar';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StockPredictions } from '@/components/StockPredictions';
import { VoiceSearchBar } from '@/components/VoiceSearchBar';
import { TelecomInventory } from '@/components/TelecomInventory';
import { smartParseExcel, PRODUCT_MAPPINGS, type MappedRow } from '@/lib/excel-import';
import { exportXlsx, pickExcelFile, readPickedExcel } from '@/lib/xlsx-export';

type SortMode = 'name' | 'stock_low' | 'price_high' | 'recent';

export default function InventoryScreen() {
  const { settings } = useApp();

  if (settings.businessMode === 'telecom') {
    return <TelecomInventory />;
  }

  return <RetailInventory />;
}

function RetailInventory() {
  const { products, addProduct, updateProduct, deleteProduct, settings, predictions } = useApp();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number; errors: string[]; mapping: { header: string; field: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q) || p.category.toLowerCase().includes(q));
    }
    const sorted = [...list];
    switch (sortMode) {
      case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'stock_low': sorted.sort((a, b) => a.stock - b.stock); break;
      case 'price_high': sorted.sort((a, b) => b.price - a.price); break;
      case 'recent': sorted.sort((a, b) => b.createdAt - a.createdAt); break;
    }
    return sorted;
  }, [products, search, sortMode]);

  const totalValue = products.reduce((s, p) => s + p.cost * p.stock, 0);
  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  const lowStock = products.filter((p) => p.stock <= p.minStock).length;

  const handleSave = (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editProduct) {
      updateProduct(editProduct.id, data);
    } else {
      addProduct(data);
    }
    setShowForm(false);
    setEditProduct(null);
  };

  const handleEdit = (p: Product) => {
    setEditProduct(p);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditProduct(null);
    setShowForm(true);
  };

  const handleExportTemplate = async () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'اسم المنتج': '', 'الباركود': '', 'سعر البيع': '', 'سعر التكلفة': '', 'الكمية': '', 'الوحدة': 'حبة', 'حد التنبيه': '5', 'الفئة': '', 'تاريخ الانتهاء': '' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'القالب');
    await exportXlsx(wb, 'قالب_المنتجات.xlsx');
  };

  const handleExportProducts = async () => {
    const data = products.map((p) => ({
      'اسم المنتج': p.name,
      'الباركود': p.barcode,
      'سعر البيع': p.price,
      'سعر التكلفة': p.cost,
      'الكمية': p.stock,
      'الوحدة': p.unit,
      'حد التنبيه': p.minStock,
      'الفئة': p.category,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المنتجات');
    await exportXlsx(wb, `المنتجات_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (!(result instanceof ArrayBuffer)) {
        setImportResult({ added: 0, skipped: 0, errors: ['تعذر قراءة الملف'], mapping: [] });
        setImporting(false);
        return;
      }
      const existingBarcodes = new Set(products.map((p) => p.barcode).filter(Boolean));
      const existingNames = new Set(products.map((p) => p.name.toLowerCase()));
      const parsed = smartParseExcel(result, PRODUCT_MAPPINGS, (mapped: MappedRow) => {
        const name = String(mapped.name ?? '').trim();
        if (!name) return null;
        if (existingNames.has(name.toLowerCase())) return null;
        const barcode = String(mapped.barcode ?? '').trim();
        if (barcode && existingBarcodes.has(barcode)) return null;
        const productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
          name,
          barcode: barcode || Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
          localBarcode: String(mapped.localBarcode ?? '').trim() || `LOC-${Date.now()}`,
          price: Number(mapped.price) || 0,
          cost: Number(mapped.cost) || 0,
          stock: Number(mapped.stock) || 0,
          unit: String(mapped.unit ?? 'حبة').trim() || 'حبة',
          subUnits: [],
          minStock: Number(mapped.minStock) || 0,
          category: String(mapped.category ?? 'عام').trim() || 'عام',
          expiryDate: mapped.expiryDate !== null && mapped.expiryDate !== undefined ? Number(mapped.expiryDate) : null,
        };
        existingNames.add(name.toLowerCase());
        if (barcode) existingBarcodes.add(barcode);
        addProduct(productData);
        return productData;
      });
      setImportResult({ added: parsed.rows.length, skipped: parsed.skipped, errors: parsed.errors, mapping: parsed.detectedMapping });
      setImporting(false);
      if (e.target) e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportMobile = async () => {
    const picked = await pickExcelFile();
    if (!picked) return;
    setImporting(true);
    try {
      const wb = await readPickedExcel(picked);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) {
        setImportResult({ added: 0, skipped: 0, errors: ['الملف فارغ أو لا يحتوي على بيانات'], mapping: [] });
        setImporting(false);
        return;
      }
      const arrayBuffer = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })).buffer;
      const existingBarcodes = new Set(products.map((p) => p.barcode).filter(Boolean));
      const existingNames = new Set(products.map((p) => p.name.toLowerCase()));
      const parsed = smartParseExcel(arrayBuffer, PRODUCT_MAPPINGS, (mapped: MappedRow) => {
        const name = String(mapped.name ?? '').trim();
        if (!name) return null;
        if (existingNames.has(name.toLowerCase())) return null;
        const barcode = String(mapped.barcode ?? '').trim();
        if (barcode && existingBarcodes.has(barcode)) return null;
        const productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
          name,
          barcode: barcode || Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
          localBarcode: String(mapped.localBarcode ?? '').trim() || `LOC-${Date.now()}`,
          price: Number(mapped.price) || 0,
          cost: Number(mapped.cost) || 0,
          stock: Number(mapped.stock) || 0,
          unit: String(mapped.unit ?? 'حبة').trim() || 'حبة',
          subUnits: [],
          minStock: Number(mapped.minStock) || 0,
          category: String(mapped.category ?? 'عام').trim() || 'عام',
          expiryDate: mapped.expiryDate !== null && mapped.expiryDate !== undefined ? Number(mapped.expiryDate) : null,
        };
        existingNames.add(name.toLowerCase());
        if (barcode) existingBarcodes.add(barcode);
        addProduct(productData);
        return productData;
      });
      setImportResult({ added: parsed.rows.length, skipped: parsed.skipped, errors: parsed.errors, mapping: parsed.detectedMapping });
    } catch {
      setImportResult({ added: 0, skipped: 0, errors: ['تعذر قراءة الملف. تأكد أنه ملف إكسل صحيح'], mapping: [] });
    }
    setImporting(false);
  };

  const renderItem = ({ item }: { item: Product }) => {
    const profit = item.price - item.cost;
    const profitMargin = item.cost > 0 ? ((profit / item.price) * 100).toFixed(0) : '100';
    const isLowStock = item.stock <= item.minStock;
    const isOutOfStock = item.stock === 0;

    return (
      <View style={[styles.productItem, { backgroundColor: colors.surface }]}>
        <View style={styles.productItemHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.productItemName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
            <Text style={[styles.productItemCategory, { color: colors.textMuted }]}>{item.category}</Text>
          </View>
          <View style={styles.productItemActions}>
            <TouchableOpacity
              onPress={() => handleEdit(item)}
              style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt }]}
            >
              <Pencil size={16} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDeleteTarget(item)}
              style={[styles.actionBtn, { backgroundColor: colors.danger + '15' }]}
            >
              <Trash2 size={16} color={colors.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.productItemDetails}>
          <DetailChip
            label="السعر"
            value={formatCurrency(item.price, settings.currency)}
            color={colors.primary}
            bg={colors.primary + '15'}
          />
          <DetailChip
            label="التكلفة"
            value={formatCurrency(item.cost, settings.currency)}
            color={colors.textSecondary}
            bg={colors.surfaceAlt}
          />
          <DetailChip
            label="الربح"
            value={`${profitMargin}%`}
            color={colors.success}
            bg={colors.success + '15'}
          />
        </View>

        <View style={styles.productItemFooter}>
          <View style={styles.stockInfo}>
            <Boxes size={16} color={isLowStock ? colors.danger : colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.stockValue, { color: isOutOfStock ? colors.danger : isLowStock ? colors.warning : colors.text }]}>
              {item.stock} {item.unit}
            </Text>
            {isLowStock && (
              <View style={[styles.lowStockBadge, { backgroundColor: colors.danger + '15' }]}>
                <AlertTriangle size={10} color={colors.danger} strokeWidth={2.5} />
                <Text style={[styles.lowStockText, { color: colors.danger }]}>
                  {isOutOfStock ? 'نفذ المخزون' : 'مخزون منخفض'}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.barcodeText, { color: colors.textMuted }]}>{item.barcode}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Stats */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <MiniStat icon={<Boxes size={18} color={colors.primary} strokeWidth={2} />} label="المنتجات" value={formatNumber(products.length)} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MiniStat icon={<Tag size={18} color={colors.info} strokeWidth={2} />} label="قيمة المخزون" value={formatCurrency(totalValue, settings.currency)} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MiniStat icon={<AlertTriangle size={18} color={lowStock > 0 ? colors.danger : colors.textMuted} strokeWidth={2} />} label="منخفض" value={formatNumber(lowStock)} colors={colors} />
      </View>

      {/* Search + Sort */}
      <View style={styles.searchArea}>
        <OmniSearchBar value={search} onChangeText={setSearch} placeholder="ابحث عن منتج، باركود، فئة..." />
        <VoiceSearchBar enabled={settings.enableVoiceSearch} onResult={(text) => setSearch(text)} />
      </View>

      {/* Sort Bar */}
      <View style={styles.sortBar}>
        {([
          { key: 'recent', label: 'الأحدث' },
          { key: 'name', label: 'الاسم' },
          { key: 'stock_low', label: 'المخزون' },
          { key: 'price_high', label: 'السعر' },
        ] as { key: SortMode; label: string }[]).map((s) => (
          <TouchableOpacity
            key={s.key}
            onPress={() => setSortMode(s.key)}
            style={[styles.sortChip, sortMode === s.key ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortChipText, { color: sortMode === s.key ? '#FFFFFF' : colors.textSecondary }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stock Predictions */}
      {settings.enableStockPrediction && predictions.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <StockPredictions
            predictions={predictions}
            currency={settings.currency}
            onOrderProduct={() => handleAddNew()}
          />
        </View>
      )}

      {/* Product List */}
      {filteredProducts.length === 0 ? (
        <View style={styles.emptyWrap}>
          {products.length === 0 ? (
            <EmptyState
              icon={<Package size={32} color={colors.primary} strokeWidth={2} />}
              title="المخزون فارغ"
              subtitle="أضف منتجاتك الأولية لبدء إدارة مخزونك ومبيعاتك"
              actionLabel="إضافة منتج"
              onAction={handleAddNew}
            />
          ) : (
            <EmptyState
              icon={<Search size={32} color={colors.textMuted} strokeWidth={2} />}
              title="لا نتائج"
              subtitle="جرّب كلمة بحث أخرى"
            />
          )}
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Import/Export Bar */}
      <View style={styles.importExportBar}>
        <TouchableOpacity
          onPress={handleExportTemplate}
          style={[styles.importExportBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <FileSpreadsheet size={18} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.importExportText, { color: colors.text }]}>قالب إكسل</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleExportProducts}
          style={[styles.importExportBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Download size={18} color={colors.success} strokeWidth={2} />
          <Text style={[styles.importExportText, { color: colors.text }]}>تصدير</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setImportResult(null); setShowImportModal(true); }}
          style={[styles.importExportBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.7}
        >
          <Upload size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={[styles.importExportText, { color: '#FFFFFF' }]}>استيراد</Text>
        </TouchableOpacity>
      </View>

      {/* FAB */}
      <TouchableOpacity
        onPress={handleAddNew}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
      >
        <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      {/* Form Modal */}
      <ProductFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditProduct(null); }}
        onSave={handleSave}
        editProduct={editProduct}
        currency={settings.currency}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        visible={deleteTarget !== null}
        title="حذف المنتج"
        message={`هل تريد حذف "${deleteTarget?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={() => { if (deleteTarget) deleteProduct(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Import Modal */}
      <BaseModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="استيراد منتجات من إكسل"
        footer={
          <View style={styles.importFooter}>
            <TouchableOpacity
              onPress={() => setShowImportModal(false)}
              style={[styles.importCancelBtn, { backgroundColor: colors.surfaceAlt }]}
            >
              <Text style={[styles.importCancelText, { color: colors.textSecondary }]}>إغلاق</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Platform.OS === 'web' ? fileInputRef.current?.click() : handleImportMobile()}
              disabled={importing}
              style={[styles.saveBtn, { backgroundColor: colors.primary, flex: 1 }]}
              activeOpacity={0.8}
            >
              <Upload size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.saveBtnText}>{importing ? 'جاري الاستيراد...' : 'اختيار ملف'}</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={[styles.importInfoBox, { backgroundColor: colors.info + '12' }]}>
          <Info size={18} color={colors.info} strokeWidth={2} />
          <Text style={[styles.importInfoText, { color: colors.textSecondary }]}>
            يقوم التطبيق بالتعرف التلقائي على أعمدة الملف بغض النظر عن ترتيبها أو مسمياتها. يدعم: الاسم، الباركود، السعر، التكلفة، الكمية، الوحدة، الفئة، حد التنبيه، وتاريخ الانتهاء.
          </Text>
        </View>

        {importResult && (
          <View style={[styles.importResultBox, { backgroundColor: importResult.errors.length > 0 ? colors.warning + '15' : colors.success + '15' }]}>
            <View style={styles.importResultRow}>
              <Check size={18} color={colors.success} strokeWidth={2} />
              <Text style={[styles.importResultText, { color: colors.text }]}>تمت إضافة {importResult.added} منتج</Text>
            </View>
            {importResult.skipped > 0 && (
              <View style={styles.importResultRow}>
                <AlertTriangle size={16} color={colors.warning} strokeWidth={2} />
                <Text style={[styles.importResultText, { color: colors.text }]}>تم تجاهل {importResult.skipped} صف (مكرر أو ناقص)</Text>
              </View>
            )}
            {importResult.mapping.length > 0 && (
              <View style={styles.mappingBox}>
                <Text style={[styles.mappingTitle, { color: colors.textMuted }]}>الأعمدة المتعرف عليها:</Text>
                {importResult.mapping.map((m, i) => (
                  <Text key={i} style={[styles.mappingItem, { color: colors.textSecondary }]}>
                    &quot;{m.header}&quot; ← {m.field}
                  </Text>
                ))}
              </View>
            )}
            {importResult.errors.map((err, i) => (
              <Text key={i} style={[styles.importErrorText, { color: colors.danger }]}>{err}</Text>
            ))}
          </View>
        )}

        {Platform.OS === 'web' && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        )}
      </BaseModal>
    </View>
  );
}

function MiniStat({ icon, label, value, colors }: { icon: React.ReactNode; label: string; value: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={styles.miniStat}>
      {icon}
      <View style={styles.miniStatInfo}>
        <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.miniStatValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function DetailChip({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <View style={[styles.detailChip, { backgroundColor: bg }]}>
      <Text style={[styles.detailChipLabel, { color: color }]}>{label}</Text>
      <Text style={[styles.detailChipValue, { color: color }]}>{value}</Text>
    </View>
  );
}

function ProductFormModal({
  visible, onClose, onSave, editProduct, currency,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  editProduct: Product | null;
  currency: string;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [localBarcode, setLocalBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('حبة');
  const [minStock, setMinStock] = useState('5');
  const [category, setCategory] = useState('');
  const [subUnits, setSubUnits] = useState<SubUnit[]>([]);
  const [error, setError] = useState('');

  // Reset on open
  useEffect(() => {
    if (visible) {
      setName(editProduct?.name ?? '');
      setBarcode(editProduct?.barcode ?? '');
      setLocalBarcode(editProduct?.localBarcode ?? '');
      setPrice(editProduct?.price.toString() ?? '');
      setCost(editProduct?.cost.toString() ?? '');
      setStock(editProduct?.stock.toString() ?? '');
      setUnit(editProduct?.unit ?? 'حبة');
      setMinStock(editProduct?.minStock.toString() ?? '5');
      setCategory(editProduct?.category ?? '');
      setSubUnits(editProduct?.subUnits ?? []);
      setError('');
    }
  }, [visible, editProduct]);

  const handleSave = () => {
    if (!name.trim()) { setError('اسم المنتج مطلوب'); return; }
    if (!price.trim() || parseFloat(price) <= 0) { setError('السعر يجب أن يكون أكبر من صفر'); return; }
    onSave({
      name: name.trim(),
      barcode: barcode.trim() || Date.now().toString(),
      localBarcode: localBarcode.trim() || `LOC-${Date.now()}`,
      price: parseFloat(price) || 0,
      cost: parseFloat(cost) || 0,
      stock: parseInt(stock) || 0,
      unit: unit.trim() || 'حبة',
      subUnits,
      minStock: parseInt(minStock) || 0,
      category: category.trim() || 'عام',
      expiryDate: editProduct?.expiryDate ?? null,
    });
  };

  const addSubUnit = () => {
    setSubUnits((prev) => [...prev, { name: '', factor: 1, price: 0 }]);
  };

  const updateSubUnit = (index: number, field: keyof SubUnit, value: string) => {
    setSubUnits((prev) => prev.map((su, i) =>
      i === index ? { ...su, [field]: field === 'name' ? value : parseFloat(value) || 0 } : su
    ));
  };

  const removeSubUnit = (index: number) => {
    setSubUnits((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editProduct ? 'تعديل المنتج' : 'منتج جديد'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{editProduct ? 'حفظ التعديلات' : 'إضافة المنتج'}</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <Field label="اسم المنتج" colors={colors}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="مثال: أرز بسمتي 5كجم"
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
      </Field>

      <View style={styles.formRow}>
        <Field label="الباركود الدولي" colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={barcode}
            onChangeText={setBarcode}
            placeholder="باركود المنتج"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </Field>
        <Field label="باركود محلي" colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={localBarcode}
            onChangeText={setLocalBarcode}
            placeholder="باركود داخلي"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </Field>
      </View>

      <View style={styles.formRow}>
        <Field label="الفئة" colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="مثال: مواد غذائية"
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </Field>
      </View>

      <View style={styles.formRow}>
        <Field label={`سعر البيع (${currency})`} colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </Field>
        <Field label={`سعر التكلفة (${currency})`} colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={cost}
            onChangeText={setCost}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </Field>
      </View>

      <View style={styles.formRow}>
        <Field label="الكمية" colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={stock}
            onChangeText={setStock}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </Field>
        <Field label="الوحدة" colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={unit}
            onChangeText={setUnit}
            placeholder="حبة"
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </Field>
        <Field label="حد التنبيه" colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={minStock}
            onChangeText={setMinStock}
            placeholder="5"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </Field>
      </View>

      {/* Multi-Unit Support */}
      <View style={styles.subUnitSection}>
        <View style={styles.subUnitHeader}>
          <Text style={[styles.subUnitTitle, { color: colors.text }]}>وحدات البيع الفرعية</Text>
          <TouchableOpacity onPress={addSubUnit} style={[styles.addSubUnitBtn, { backgroundColor: colors.primary + '15' }]}>
            <Plus size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.addSubUnitText, { color: colors.primary }]}>إضافة وحدة</Text>
          </TouchableOpacity>
        </View>
        {subUnits.map((su, i) => (
          <View key={i} style={[styles.subUnitRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <TextInput
              value={su.name}
              onChangeText={(v) => updateSubUnit(i, 'name', v)}
              placeholder="اسم الوحدة"
              placeholderTextColor={colors.textMuted}
              style={[styles.subUnitInput, { color: colors.text }]}
            />
            <TextInput
              value={su.factor.toString()}
              onChangeText={(v) => updateSubUnit(i, 'factor', v)}
              placeholder="المعامل"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.subUnitInputNarrow, { color: colors.text }]}
            />
            <TextInput
              value={su.price.toString()}
              onChangeText={(v) => updateSubUnit(i, 'price', v)}
              placeholder="السعر"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.subUnitInputNarrow, { color: colors.text }]}
            />
            <TouchableOpacity onPress={() => removeSubUnit(i)} style={[styles.removeSubUnitBtn, { backgroundColor: colors.danger + '15' }]}>
              <X size={16} color={colors.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </BaseModal>
  );
}

function Field({ label, children, colors, style }: { label: string; children: React.ReactNode; colors: ReturnType<typeof useTheme>['colors']; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
  },
  miniStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniStatInfo: { gap: 1 },
  miniStatLabel: { fontSize: 11 },
  miniStatValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  divider: { width: 1, height: 28, marginHorizontal: 4 },
  searchArea: { paddingHorizontal: 16, paddingBottom: 8 },
  sortBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  sortChipText: { fontSize: 13, fontWeight: '600' },
  emptyWrap: { flex: 1 },
  productItem: {
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  productItemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  productItemName: { fontSize: 15, fontWeight: '700', lineHeight: 20, flex: 1 },
  productItemCategory: { fontSize: 12, marginTop: 2 },
  productItemActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  productItemDetails: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  detailChip: { flex: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  detailChipLabel: { fontSize: 11 },
  detailChipValue: { fontSize: 13, fontWeight: '700' },
  productItemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stockInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockValue: { fontSize: 14, fontWeight: '700' },
  lowStockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  lowStockText: { fontSize: 10, fontWeight: '700' },
  barcodeText: { fontSize: 12 },
  fab: {
    position: 'absolute', bottom: 80, right: 16,
    width: 56, height: 56, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  // Form
  errorBox: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  formRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  textInput: {
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15,
  },
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  subUnitSection: { marginBottom: 12 },
  subUnitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subUnitTitle: { fontSize: 14, fontWeight: '700' },
  addSubUnitBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  addSubUnitText: { fontSize: 12, fontWeight: '600' },
  subUnitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 8, marginBottom: 8 },
  subUnitInput: { flex: 1, fontSize: 13, paddingVertical: 6 },
  subUnitInputNarrow: { width: 70, fontSize: 13, paddingVertical: 6, textAlign: 'center' },
  removeSubUnitBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  importExportBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  importExportBtn: { flexGrow: 1, flexBasis: 140, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  importExportText: { fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  importFooter: { flexDirection: 'row', gap: 10 },
  importCancelBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', paddingHorizontal: 20 },
  importCancelText: { fontSize: 15, fontWeight: '700' },
  importInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, marginBottom: 16 },
  importInfoText: { fontSize: 13, lineHeight: 20, flex: 1 },
  importResultBox: { borderRadius: 12, padding: 14, gap: 8 },
  importResultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importResultText: { fontSize: 14, fontWeight: '600' },
  importErrorText: { fontSize: 12, fontWeight: '600' },
  mappingBox: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.2)', gap: 2 },
  mappingTitle: { fontSize: 12, fontWeight: '700' },
  mappingItem: { fontSize: 11 },
});
