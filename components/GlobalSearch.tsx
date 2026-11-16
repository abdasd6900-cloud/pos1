import { useMemo, useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, Keyboard } from 'react-native';
import { router } from 'expo-router';
import {
  Search, X, Package, Users, ShoppingCart, Signal,
  Truck, PlusCircle, Wallet, FileText, UserRound,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, timeAgo, normalizePhoneNumber } from '@/lib/format';
import type { Customer, TelecomSale } from '@/types';

type ResultKind = 'product' | 'customer' | 'transaction' | 'telecomSale' | 'supplier';

type SearchResult = {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  matchLabel: string;
  route: string;
  customer?: Customer | null;
  telecomSale?: TelecomSale | null;
  phone?: string;
  simNumber?: string;
};

const KIND_META: Record<ResultKind, { icon: typeof Package; label: string }> = {
  product: { icon: Package, label: 'منتج' },
  customer: { icon: Users, label: 'زبون' },
  transaction: { icon: ShoppingCart, label: 'عملية' },
  telecomSale: { icon: Signal, label: 'شريحة' },
  supplier: { icon: Truck, label: 'مورد' },
};

const DIGIT_RE = /^\+?[\d\s-]{3,}$/;

export function GlobalSearch() {
  const { colors } = useTheme();
  const {
    products, customers, transactions, telecomSales,
    suppliers, settings,
  } = useApp();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const normQ = normalizePhoneNumber(q);
    const out: SearchResult[] = [];

    for (const p of products) {
      if (
        p.name.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.localBarcode.includes(q) ||
        p.category.toLowerCase().includes(q)
      ) {
        out.push({
          id: `p-${p.id}`, kind: 'product', route: '/inventory',
          title: p.name,
          subtitle: `الكمية: ${p.stock} ${p.unit} • ${formatCurrency(p.price, settings.currency)}`,
          matchLabel: KIND_META.product.label,
        });
      }
    }

    for (const c of customers) {
      const normPhone = normalizePhoneNumber(c.phone);
      if (c.name.toLowerCase().includes(q) || normPhone.includes(normQ)) {
        out.push({
          id: `c-${c.id}`, kind: 'customer', route: '/customers',
          title: c.name,
          subtitle: `${c.phone}${c.debt > 0 ? ` • دين: ${formatCurrency(c.debt, settings.currency)}` : ''}`,
          matchLabel: KIND_META.customer.label,
          customer: c,
          phone: c.phone,
        });
      }
    }

    for (const t of transactions) {
      if (
        (t.customerName && t.customerName.toLowerCase().includes(q)) ||
        t.id.toLowerCase().includes(q)
      ) {
        const matchedCustomer = customers.find((c) => c.name === t.customerName) ?? null;
        out.push({
          id: `t-${t.id}`, kind: 'transaction', route: '/reports',
          title: t.customerName || 'عميل نقدي',
          subtitle: `${formatCurrency(t.total, settings.currency)} • ${timeAgo(t.createdAt)}`,
          matchLabel: KIND_META.transaction.label,
          customer: matchedCustomer,
        });
      }
    }

    for (const s of telecomSales) {
      const normPhone = normalizePhoneNumber(s.customerPhone ?? '');
      if (
        (s.simNumber && s.simNumber.toLowerCase().includes(q)) ||
        (s.customerName && s.customerName.toLowerCase().includes(q)) ||
        normPhone.includes(normQ)
      ) {
        const matchedCustomer = s.customerId ? customers.find((c) => c.id === s.customerId) ?? null : null;
        out.push({
          id: `s-${s.id}`, kind: 'telecomSale', route: '/pos-telecom',
          title: s.simNumber || s.customerName || '—',
          subtitle: `${s.customerName ?? ''} ${s.customerPhone ?? ''} • ${s.companyName ?? ''}`.trim(),
          matchLabel: KIND_META.telecomSale.label,
          customer: matchedCustomer,
          telecomSale: s,
          phone: s.customerPhone,
          simNumber: s.simNumber,
        });
      }
    }

    for (const sup of suppliers) {
      const normPhone = normalizePhoneNumber(sup.phone ?? '');
      if (
        sup.name.toLowerCase().includes(q) ||
        normPhone.includes(normQ)
      ) {
        out.push({
          id: `sup-${sup.id}`, kind: 'supplier', route: '/suppliers',
          title: sup.name,
          subtitle: sup.phone ?? '',
          matchLabel: KIND_META.supplier.label,
        });
      }
    }

    return out.slice(0, 20);
  }, [query, products, customers, transactions, telecomSales, suppliers, settings.currency]);

  const looksLikePhone = DIGIT_RE.test(query.trim());
  const trimmedQuery = query.trim();
  const noResults = trimmedQuery.length > 0 && results.length === 0;

  const go = (route: string) => {
    Keyboard.dismiss();
    setFocused(false);
    router.navigate(route as never);
  };

  const startNewOperation = (item?: SearchResult) => {
    Keyboard.dismiss();
    setFocused(false);
    if (settings.businessMode === 'telecom') {
      const params = new URLSearchParams();
      if (item?.simNumber) params.set('sim', item.simNumber);
      if (item?.phone) params.set('phone', item.phone);
      if (item?.customer?.name) params.set('name', item.customer.name);
      const qs = params.toString();
      router.navigate(`/pos-telecom${qs ? `?${qs}` : ''}` as never);
    } else {
      router.navigate('/pos-retail' as never);
    }
  };

  const openCustomerFile = (customer: Customer) => {
    Keyboard.dismiss();
    setFocused(false);
    const params = new URLSearchParams();
    params.set('id', customer.id);
    router.navigate(`/customers?${params.toString()}` as never);
  };

  const renderItem = ({ item }: { item: SearchResult }) => {
    const meta = KIND_META[item.kind];
    const Icon = meta.icon;
    const hasCustomer = !!item.customer;
    const isTelecom = item.kind === 'telecomSale' || item.kind === 'customer' || item.kind === 'transaction';
    return (
      <View style={[styles.rowWrap, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => go(item.route)}
          style={styles.row}
          activeOpacity={0.7}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.primary + '15' }]}>
            <Icon size={16} color={colors.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{item.subtitle}</Text>
          </View>
          <View style={[styles.rowBadge, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.rowBadgeText, { color: colors.textSecondary }]}>{item.matchLabel}</Text>
          </View>
        </TouchableOpacity>
        {/* Action buttons */}
        <View style={styles.rowActions}>
          {isTelecom && (
            <TouchableOpacity
              onPress={() => startNewOperation(item)}
              style={[styles.rowActionBtn, { backgroundColor: colors.primary + '15' }]}
              activeOpacity={0.7}
            >
              <PlusCircle size={14} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.rowActionText, { color: colors.primary }]}>عملية جديدة</Text>
            </TouchableOpacity>
          )}
          {hasCustomer && item.customer && (
            <TouchableOpacity
              onPress={() => openCustomerFile(item.customer!)}
              style={[styles.rowActionBtn, { backgroundColor: colors.accent + '15' }]}
              activeOpacity={0.7}
            >
              <UserRound size={14} color={colors.accent} strokeWidth={2} />
              <Text style={[styles.rowActionText, { color: colors.accent }]}>ملف الزبون</Text>
            </TouchableOpacity>
          )}
          {!hasCustomer && item.phone && (
            <TouchableOpacity
              onPress={() => go('/customers')}
              style={[styles.rowActionBtn, { backgroundColor: colors.accent + '15' }]}
              activeOpacity={0.7}
            >
              <FileText size={14} color={colors.accent} strokeWidth={2} />
              <Text style={[styles.rowActionText, { color: colors.accent }]}>بحث في الزبائن</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.wrap, focused && { zIndex: 100 }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: focused ? colors.primary : colors.border }]}>
        <Search size={20} color={colors.textMuted} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="بحث شامل: اسم، رقم جوال، باركود، شريحة..."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }]}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
            <X size={16} color={colors.textMuted} strokeWidth={2.5} />
          </TouchableOpacity>
        ) : null}
      </View>

      {focused && trimmedQuery.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {results.length > 0 ? (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              scrollEnabled={false}
              ItemSeparatorComponent={undefined}
            />
          ) : null}

          {noResults && (
            <View style={styles.noResults}>
              <Text style={[styles.noResultsText, { color: colors.textMuted }]}>
                {looksLikePhone
                  ? 'لا يوجد زبون أو عملية بهذا الرقم'
                  : 'لا توجد نتائج مطابقة'}
              </Text>
            </View>
          )}

          {/* Always show "new operation" button */}
          <TouchableOpacity
            onPress={() => startNewOperation(undefined)}
            style={[styles.useNewBtn, { backgroundColor: colors.primary + '15' }]}
            activeOpacity={0.7}
          >
            <PlusCircle size={18} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.useNewText, { color: colors.primary }]}>
              {noResults && looksLikePhone
                ? `استخدام "${trimmedQuery}" كرقم جديد`
                : 'عملية جديدة'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  bar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    height: 50, borderRadius: 14, borderWidth: 1, gap: 10,
  },
  input: { flex: 1, fontSize: 15, height: '100%', padding: 0, fontFamily: 'Cairo-Regular' },
  clearBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dropdown: {
    position: 'absolute', top: 56, left: 0, right: 0,
    borderRadius: 14, borderWidth: 1, paddingVertical: 6,
    maxHeight: 420, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
  rowWrap: { borderBottomWidth: 1, paddingHorizontal: 4, paddingVertical: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  rowSub: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  rowBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  rowBadgeText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  rowActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 8, flexWrap: 'wrap' },
  rowActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  rowActionText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  noResults: { paddingHorizontal: 14, paddingVertical: 14 },
  noResultsText: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  useNewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12,
  },
  useNewText: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
});
