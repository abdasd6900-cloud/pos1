import { StyleSheet, View, Text, TouchableOpacity, FlatList, TextInput, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import {
  Signal as SimIcon, Zap, Plus, Search, Trash2, Pencil,
  AlertTriangle, Signal, CreditCard, Smartphone, X, User, Check,
  MapPin, ChevronDown, ChevronUp, Boxes, Truck, Package, Phone,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { SimCard, Bundle, TelecomCompany, SimType, SubAgent, AgentBundle, SimLocation, SimLocationStock, Shipment, Supplier } from '@/types';
import { WEEK_DAY_NAMES } from '@/lib/business-hours';
import { OmniSearchBar } from '@/components/OmniSearchBar';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type Tab = 'sims' | 'agents' | 'shipments';
type Colors = ReturnType<typeof useTheme>['colors'];

export function TelecomInventory() {
  const {
    telecomCompanies, simCards, subAgents, agentBundles,
    addSimCard, updateSimCard, deleteSimCard,
    addSubAgent, updateSubAgent, deleteSubAgent,
    addAgentBundle, updateAgentBundle, deleteAgentBundle,
    simLocations, simLocationStock,
    addSimLocation, updateSimLocation, deleteSimLocation,
    addSimLocationStock, updateSimLocationStock, deleteSimLocationStock,
    suppliers, shipments,
    addShipment, deleteShipment,
    settings,
  } = useApp();
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 900;
  const [tab, setTab] = useState<Tab>('agents');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<SubAgent | SimCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubAgent | SimCard | null>(null);

  // Agent bundle management
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showBundleForm, setShowBundleForm] = useState(false);
  const [editBundle, setEditBundle] = useState<AgentBundle | null>(null);
  const [bundleDeleteTarget, setBundleDeleteTarget] = useState<AgentBundle | null>(null);
  const [bundleAgent, setBundleAgent] = useState<SubAgent | null>(null);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerAgent, setOfferAgent] = useState<SubAgent | null>(null);
  const [offerEditBundle, setOfferEditBundle] = useState<AgentBundle | null>(null);

  // Location management
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editLocation, setEditLocation] = useState<SimLocation | null>(null);
  const [locationDeleteTarget, setLocationDeleteTarget] = useState<SimLocation | null>(null);
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);
  const [showStockForm, setShowStockForm] = useState(false);
  const [editStock, setEditStock] = useState<SimLocationStock | null>(null);
  const [stockLocation, setStockLocation] = useState<SimLocation | null>(null);

  // Shipment management
  const [showShipmentForm, setShowShipmentForm] = useState(false);
  const [deleteShipmentTarget, setDeleteShipmentTarget] = useState<Shipment | null>(null);

  const filteredAgents = useMemo(() => {
    if (!search.trim()) return subAgents;
    const q = search.trim().toLowerCase();
    return subAgents.filter((a) => a.name.toLowerCase().includes(q) || a.phone.includes(q));
  }, [subAgents, search]);

  const filteredSims = useMemo(() => {
    if (!search.trim()) return simCards;
    const q = search.trim().toLowerCase();
    return simCards.filter((s) => s.name.toLowerCase().includes(q) || s.companyName.toLowerCase().includes(q) || s.barcode.includes(q));
  }, [simCards, search]);

  const filteredShipments = useMemo(() => {
    if (!search.trim()) return shipments;
    const q = search.trim().toLowerCase();
    return shipments.filter((s) => s.supplierName.toLowerCase().includes(q) || s.subAgentName.toLowerCase().includes(q));
  }, [shipments, search]);

  const lowStockCount = simCards.filter((s) => s.stock <= s.minStock).length;
  const totalSimStock = simCards.reduce((sum, s) => sum + s.stock, 0);

  const handleDelete = () => {
    if (!deleteTarget) return;
    if ('bundlePrice' in deleteTarget) {
      deleteSimCard(deleteTarget.id);
    } else {
      deleteSubAgent(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const totalShipments = shipments.reduce((sum, s) => sum + s.amount, 0);

  const renderAgent = ({ item }: { item: SubAgent }) => {
    const agentCompanies = telecomCompanies.filter((c) => item.companyIds.includes(c.id));
    const agentBundlesList = agentBundles.filter((b) => b.subAgentId === item.id);
    const isExpanded = expandedAgent === item.id;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.bundleBadge, { backgroundColor: colors.info + '20' }]}>
            <User size={16} color={colors.info} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.cardCompany, { color: colors.textMuted }]}>{item.phone}</Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => setExpandedAgent(isExpanded ? null : item.id)} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt }]}>
              {isExpanded ? <ChevronUp size={15} color={colors.textSecondary} strokeWidth={2} /> : <ChevronDown size={15} color={colors.textSecondary} strokeWidth={2} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditItem(item); setShowForm(true); }} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt }]}>
              <Pencil size={15} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteTarget(item)} style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]}>
              <Trash2 size={15} color={colors.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.cardDetails}>
          <DetailChip label="الرصيد" value={formatCurrency(item.balance, settings.currency)} color={colors.primary} bg={colors.primary + '15'} />
          <DetailChip label="الشركات" value={formatNumber(agentCompanies.length)} color={colors.info} bg={colors.info + '15'} />
          <DetailChip label="الحزم" value={formatNumber(agentBundlesList.length)} color={colors.accent} bg={colors.accent + '15'} />
        </View>
        {agentCompanies.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 0 }}>
            {agentCompanies.map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: c.color + '15' }}>
                <View style={[styles.companyDot, { backgroundColor: c.color }]} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.name}</Text>
              </View>
            ))}
          </View>
        )}

        {isExpanded && (
          <View style={[styles.bundlesSection, { borderTopColor: colors.border }]}>
            <View style={styles.bundlesSectionHeader}>
              <Text style={[styles.bundlesSectionTitle, { color: colors.text }]}>حزم الوكيل</Text>
              <TouchableOpacity
                onPress={() => { setBundleAgent(item); setEditBundle(null); setShowBundleForm(true); }}
                style={[styles.addBundleBtn, { backgroundColor: colors.accent + '15' }]}
                activeOpacity={0.7}
              >
                <Plus size={14} color={colors.accent} strokeWidth={2} />
                <Text style={[styles.addBundleText, { color: colors.accent }]}>إضافة حزمة</Text>
              </TouchableOpacity>
            </View>

            {agentBundlesList.length === 0 ? (
              <Text style={[styles.noBundlesText, { color: colors.textMuted }]}>لا توجد حزم لهذا الوكيل بعد</Text>
            ) : (
              <ScrollView
                horizontal={isDesktop}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={isDesktop ? styles.desktopBundleRow : undefined}
              >
                {agentBundlesList.map((ab) => {
                  const company = telecomCompanies.find((c) => c.id === ab.companyId);
                  return (
                  <View key={ab.id} style={[styles.agentBundleCard, isDesktop && styles.desktopAgentBundleCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <View style={styles.agentBundleHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        {company && <View style={[styles.companyDot, { backgroundColor: company.color }]} />}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.agentBundleName, { color: colors.text }]} numberOfLines={1}>{ab.bundleName}</Text>
                          {company && <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>{company.name}</Text>}
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setBundleAgent(item);
                          setEditBundle(ab);
                          if (ab.bundleType === 'offer' || (ab.prices?.['3_months'] != null && ab.prices?.['month'] == null)) {
                            setOfferAgent(item);
                            setOfferEditBundle(ab);
                            setShowOfferForm(true);
                          } else {
                            setShowBundleForm(true);
                          }
                        }}
                        style={[styles.iconBtn, { backgroundColor: colors.surface }]}
                      >
                        <Pencil size={13} color={colors.textSecondary} strokeWidth={2} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setBundleDeleteTarget(ab)}
                        style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]}
                      >
                        <Trash2 size={13} color={colors.danger} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.priceGrid, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
                      {ab.prices?.['month'] != null && (
                        <View style={[styles.priceChip, { backgroundColor: colors.accent + '12' }]}>
                          <Text style={[styles.priceChipLabel, { color: colors.textMuted }]}>سعر البيع الشهري</Text>
                          <Text style={[styles.priceChipValue, { color: colors.accent }]}>{formatCurrency(ab.prices['month'], settings.currency)}</Text>
                        </View>
                      )}
                      {ab.prices?.['3_months'] != null && (
                        <View style={[styles.priceChip, { backgroundColor: colors.success + '12' }]}>
                          <Text style={[styles.priceChipLabel, { color: colors.textMuted }]}>عرض 3 شهور</Text>
                          <Text style={[styles.priceChipValue, { color: colors.success }]}>{formatCurrency(ab.prices['3_months'], settings.currency)}</Text>
                          {ab.offerType && (
                            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{ab.offerType === 'new_number' ? 'رقم جديد' : 'تجديد'}</Text>
                          )}
                        </View>
                      )}
                      {ab.prices?.['month'] == null && ab.prices?.['3_months'] == null && (
                        <Text style={[styles.noBundlesText, { color: colors.textMuted }]}>لم يتم تحديد سعر بعد</Text>
                      )}
                      {ab.cost > 0 && (
                        <View style={[styles.priceChip, { backgroundColor: colors.surfaceAlt }]}>
                          <Text style={[styles.priceChipLabel, { color: colors.textMuted }]}>التكلفة / الشراء</Text>
                          <Text style={[styles.priceChipValue, { color: colors.textSecondary }]}>{formatCurrency(ab.cost, settings.currency)}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignSelf: 'flex-start' }}>
                      <TouchableOpacity
                        onPress={() => { setOfferAgent(item); setOfferEditBundle(ab.prices?.['3_months'] != null ? ab : null); setShowOfferForm(true); }}
                        style={[styles.iconBtn, { backgroundColor: colors.success + '15' }]}
                      >
                        <Plus size={12} color={colors.success} strokeWidth={2} />
                        <Text style={{ fontSize: 11, color: colors.success, marginLeft: 4 }}>{ab.prices?.['3_months'] != null ? 'تعديل عرض 3 شهور' : 'عرض 3 شهور'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderSim = ({ item }: { item: SimCard }) => {
    const isLowStock = item.stock <= item.minStock;
    const locationStocks = simLocationStock.filter((s) => s.simCardId === item.id);
    const distributedTotal = locationStocks.reduce((sum, s) => sum + s.stock, 0);
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.simTypeBadge, { backgroundColor: item.type === 'plastic' ? colors.info + '20' : colors.accent + '20' }]}>
            {item.type === 'plastic' ? <CreditCard size={16} color={colors.info} strokeWidth={2} /> : <Smartphone size={16} color={colors.accent} strokeWidth={2} />}
            <Text style={[styles.simTypeText, { color: item.type === 'plastic' ? colors.info : colors.accent }]}>
              {item.type === 'plastic' ? 'بلاستيك' : 'إلكترونية'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.cardCompany, { color: colors.textMuted }]}>{item.companyName}</Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => { setEditItem(item); setShowForm(true); }} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt }]}>
              <Pencil size={15} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteTarget(item)} style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]}>
              <Trash2 size={15} color={colors.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.cardDetails}>
          <DetailChip label="سعر الشريحة" value={formatCurrency(item.price, settings.currency)} color={colors.primary} bg={colors.primary + '15'} />
          <DetailChip label="التكلفة" value={formatCurrency(item.cost, settings.currency)} color={colors.textSecondary} bg={colors.surfaceAlt} />
          <DetailChip label="المخزون" value={formatNumber(item.stock)} color={isLowStock ? colors.danger : colors.success} bg={isLowStock ? colors.danger + '15' : colors.success + '15'} />
        </View>
        {item.type === 'plastic' && (
          <View style={[styles.distSection, { borderTopColor: colors.border }]}>
            <View style={styles.distHeader}>
              <Text style={[styles.distTitle, { color: colors.textSecondary }]}>التوزيع على النقاط</Text>
              <Text style={[styles.distTotal, { color: colors.textMuted }]}>الموزع: {distributedTotal} / {item.stock}</Text>
            </View>
            {locationStocks.length > 0 ? (
              locationStocks.map((ls) => {
                const loc = simLocations.find((l) => l.id === ls.locationId);
                return (
                  <View key={ls.id} style={styles.distRow}>
                    <MapPin size={12} color={colors.textMuted} strokeWidth={2} />
                    <Text style={[styles.distRowName, { color: colors.text }]}>{loc?.name ?? 'نقطة محذوفة'}</Text>
                    <Text style={[styles.distRowQty, { color: colors.textSecondary }]}>{ls.stock}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.noDistText, { color: colors.textMuted }]}>لم يتم توزيع أي شرائح بعد</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <MiniStat icon={<SimIcon size={18} color={colors.primary} strokeWidth={2} />} label="الشرائح" value={formatNumber(simCards.length)} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MiniStat icon={<Boxes size={18} color={colors.info} strokeWidth={2} />} label="إجمالي المخزون" value={formatNumber(totalSimStock)} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MiniStat icon={<User size={18} color={colors.info} strokeWidth={2} />} label="الوكلاء" value={formatNumber(subAgents.length)} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MiniStat icon={<AlertTriangle size={18} color={lowStockCount > 0 ? colors.danger : colors.textMuted} strokeWidth={2} />} label="منخفض" value={formatNumber(lowStockCount)} colors={colors} />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          onPress={() => { setTab('agents'); setSearch(''); }}
          style={[styles.tabBtn, tab === 'agents' ? { backgroundColor: colors.info } : { backgroundColor: colors.surfaceAlt }]}
          activeOpacity={0.7}
        >
          <User size={16} color={tab === 'agents' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: tab === 'agents' ? '#FFFFFF' : colors.textSecondary }]}>الوكلاء</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setTab('sims'); setSearch(''); }}
          style={[styles.tabBtn, tab === 'sims' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
          activeOpacity={0.7}
        >
          <SimIcon size={16} color={tab === 'sims' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: tab === 'sims' ? '#FFFFFF' : colors.textSecondary }]}>الشرائح</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setTab('shipments'); setSearch(''); }}
          style={[styles.tabBtn, tab === 'shipments' ? { backgroundColor: colors.success } : { backgroundColor: colors.surfaceAlt }]}
          activeOpacity={0.7}
        >
          <Package size={16} color={tab === 'shipments' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: tab === 'shipments' ? '#FFFFFF' : colors.textSecondary }]}>الشحنات</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchArea}>
        <OmniSearchBar value={search} onChangeText={setSearch} placeholder={
          tab === 'sims' ? "ابحث عن شريحة..." :
          tab === 'agents' ? "ابحث عن وكيل..." :
          "ابحث عن شحنة..."
        } />
      </View>

      {tab === 'agents' ? (
        filteredAgents.length === 0 ? (
          <View style={styles.emptyWrap}>
            {subAgents.length === 0 ? (
              <EmptyState
                icon={<User size={32} color={colors.info} strokeWidth={2} />}
                title="لا يوجد وكلاء"
                subtitle="أضف الشركات الفرعية (الوكلاء) التي تبيع لشركات الاتصالات"
                actionLabel="إضافة وكيل"
                onAction={() => { setEditItem(null); setShowForm(true); }}
              />
            ) : (
              <EmptyState icon={<Search size={32} color={colors.textMuted} strokeWidth={2} />} title="لا نتائج" subtitle="جرّب كلمة بحث أخرى" />
            )}
          </View>
        ) : (
          <FlatList
            data={filteredAgents}
            keyExtractor={(item) => item.id}
            renderItem={renderAgent}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : tab === 'sims' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }} showsVerticalScrollIndicator={false}>
          {/* Locations section */}
          <View style={[styles.locationsCard, { backgroundColor: colors.surface }]}>
            <View style={styles.locationsHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MapPin size={18} color={colors.primary} strokeWidth={2} />
                <Text style={[styles.locationsTitle, { color: colors.text }]}>نقاط التوزيع</Text>
              </View>
              <TouchableOpacity
                onPress={() => { setEditLocation(null); setShowLocationForm(true); }}
                style={[styles.addLocBtn, { backgroundColor: colors.primary + '15' }]}
                activeOpacity={0.7}
              >
                <Plus size={14} color={colors.primary} strokeWidth={2} />
                <Text style={[styles.addLocText, { color: colors.primary }]}>نقطة جديدة</Text>
              </TouchableOpacity>
            </View>
            {simLocations.length === 0 ? (
              <Text style={[styles.noLocText, { color: colors.textMuted }]}>لا توجد نقاط توزيع بعد. أضف نقاط (فروع/مواقع) لتوزيع الشرائح عليها.</Text>
            ) : (
              simLocations.map((loc) => {
                const locStocks = simLocationStock.filter((s) => s.locationId === loc.id);
                const locTotal = locStocks.reduce((sum, s) => sum + s.stock, 0);
                const isExp = expandedLocation === loc.id;
                return (
                  <View key={loc.id} style={[styles.locItem, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <View style={styles.locItemHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.locName, { color: colors.text }]}>{loc.name}</Text>
                        <Text style={[styles.locTotal, { color: colors.textMuted }]}>إجمالي الشرائح: {locTotal}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setExpandedLocation(isExp ? null : loc.id)} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
                        {isExp ? <ChevronUp size={14} color={colors.textSecondary} strokeWidth={2} /> : <ChevronDown size={14} color={colors.textSecondary} strokeWidth={2} />}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setEditLocation(loc); setShowLocationForm(true); }} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
                        <Pencil size={13} color={colors.textSecondary} strokeWidth={2} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setLocationDeleteTarget(loc)} style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]}>
                        <Trash2 size={13} color={colors.danger} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                    {isExp && (
                      <View style={styles.locStockList}>
                        {locStocks.length === 0 ? (
                          <Text style={[styles.noDistText, { color: colors.textMuted }]}>لا توجد شرائح موزعة</Text>
                        ) : (
                          locStocks.map((ls) => (
                            <View key={ls.id} style={styles.locStockRow}>
                              <Text style={[styles.locStockName, { color: colors.text }]}>{ls.companyName} - {ls.simName}</Text>
                              <Text style={[styles.locStockQty, { color: colors.textSecondary }]}>{ls.stock}</Text>
                              <TouchableOpacity onPress={() => { setStockLocation(loc); setEditStock(ls); setShowStockForm(true); }} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
                                <Pencil size={12} color={colors.textSecondary} strokeWidth={2} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => deleteSimLocationStock(ls.id)} style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]}>
                                <Trash2 size={12} color={colors.danger} strokeWidth={2} />
                              </TouchableOpacity>
                            </View>
                          ))
                        )}
                        <TouchableOpacity
                          onPress={() => { setStockLocation(loc); setEditStock(null); setShowStockForm(true); }}
                          style={[styles.addStockBtn, { backgroundColor: colors.primary + '15' }]}
                          activeOpacity={0.7}
                        >
                          <Plus size={14} color={colors.primary} strokeWidth={2} />
                          <Text style={[styles.addStockText, { color: colors.primary }]}>توزيع شريحة</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          {/* SIM cards */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>مخزون الشرائح</Text>
          {filteredSims.length === 0 ? (
            <View style={styles.emptyWrap}>
              {simCards.length === 0 ? (
                <EmptyState
                  icon={<SimIcon size={32} color={colors.primary} strokeWidth={2} />}
                  title="لا توجد شرائح"
                  subtitle="أضف شرائح بلاستيك وإلكترونية لشركات الاتصالات"
                  actionLabel="إضافة شريحة"
                  onAction={() => { setEditItem(null); setShowForm(true); }}
                />
              ) : (
                <EmptyState icon={<Search size={32} color={colors.textMuted} strokeWidth={2} />} title="لا نتائج" subtitle="جرّب كلمة بحث أخرى" />
              )}
            </View>
          ) : (
            filteredSims.map((item) => (
              <View key={item.id}>{renderSim({ item })}</View>
            ))
          )}
        </ScrollView>
      ) : (
        /* Shipments tab */
        filteredShipments.length === 0 ? (
          <View style={styles.emptyWrap}>
            {shipments.length === 0 ? (
              <EmptyState
                icon={<Package size={32} color={colors.success} strokeWidth={2} />}
                title="لا توجد شحنات"
                subtitle="سجل شحنة جديدة لإرسال رصيد إلى وكيل"
                actionLabel="تسجيل شحنة"
                onAction={() => setShowShipmentForm(true)}
              />
            ) : (
              <EmptyState icon={<Search size={32} color={colors.textMuted} strokeWidth={2} />} title="لا نتائج" subtitle="جرّب كلمة بحث أخرى" />
            )}
          </View>
        ) : (
          <FlatList
            data={filteredShipments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const agent = subAgents.find((a) => a.id === item.subAgentId);
              const supplier = suppliers.find((s) => s.id === item.supplierId);
              const agentCompanies = agent
                ? telecomCompanies.filter((c) => agent.companyIds.includes(c.id))
                : [];
              const companyLabel = agentCompanies.length > 0
                ? agentCompanies.map((c) => c.name).join('، ')
                : 'بدون شركة';
              return (
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.bundleBadge, { backgroundColor: colors.success + '20' }]}>
                      <Package size={16} color={colors.success} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                        {companyLabel}
                      </Text>
                      <Text style={[styles.cardCompany, { color: colors.textMuted }]}>
                        المورد: {supplier?.name ?? item.supplierName} - الوكيل: {agent?.name ?? item.subAgentName}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setDeleteShipmentTarget(item)} style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]}>
                      <Trash2 size={15} color={colors.danger} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.cardDetails}>
                    <DetailChip label="المبلغ" value={formatCurrency(item.amount, settings.currency)} color={colors.success} bg={colors.success + '15'} />
                    <DetailChip label="التاريخ" value={new Date(item.createdAt).toLocaleDateString('ar')} color={colors.textSecondary} bg={colors.surfaceAlt} />
                  </View>
                  {item.notes ? (
                    <Text style={[styles.noBundlesText, { color: colors.textMuted }]} numberOfLines={2}>{item.notes}</Text>
                  ) : null}
                </View>
              );
            }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      <TouchableOpacity
        onPress={() => {
          if (tab === 'shipments') {
            setShowShipmentForm(true);
          } else {
            setEditItem(null);
            setShowForm(true);
          }
        }}
        style={[styles.fab, { backgroundColor: tab === 'sims' ? colors.primary : tab === 'agents' ? colors.info : colors.success }]}
        activeOpacity={0.8}
      >
        <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      {/* Agent/Sim Form */}
      <TelecomFormModal
        visible={showForm}
        tab={tab}
        onClose={() => { setShowForm(false); setEditItem(null); }}
        onSave={(data) => {
          if (tab === 'sims') {
            if (editItem && 'bundlePrice' in editItem) {
              updateSimCard(editItem.id, data as Partial<SimCard>);
            } else {
              addSimCard(data as Omit<SimCard, 'id' | 'createdAt' | 'updatedAt'>);
            }
          } else {
            if (editItem && 'companyIds' in editItem) {
              updateSubAgent(editItem.id, data as Partial<SubAgent>);
            } else {
              addSubAgent(data as Omit<SubAgent, 'id' | 'createdAt' | 'updatedAt'>);
            }
          }
          setShowForm(false);
          setEditItem(null);
        }}
        editItem={editItem}
        companies={telecomCompanies}
        suppliers={suppliers}
        colors={colors}
        currency={settings.currency}
      />

      {/* Agent Bundle Form */}
      <AgentBundleFormModal
        visible={showBundleForm}
        agent={bundleAgent}
        editBundle={editBundle}
        companies={telecomCompanies}
        colors={colors}
        currency={settings.currency}
        onClose={() => { setShowBundleForm(false); setEditBundle(null); setBundleAgent(null); }}
        onSave={(data) => {
          if (editBundle) {
            updateAgentBundle(editBundle.id, data as Partial<AgentBundle>);
          } else {
            addAgentBundle(data as Omit<AgentBundle, 'id' | 'createdAt' | 'updatedAt'>);
          }
          setShowBundleForm(false);
          setEditBundle(null);
          setBundleAgent(null);
        }}
      />

      {/* Agent 3-Month Offer Form */}
      <AgentOfferFormModal
        visible={showOfferForm}
        agent={offerAgent}
        editBundle={offerEditBundle}
        companies={telecomCompanies}
        colors={colors}
        currency={settings.currency}
        onClose={() => { setShowOfferForm(false); setOfferAgent(null); setOfferEditBundle(null); }}
        onSave={(data) => {
          if (offerEditBundle) {
            updateAgentBundle(offerEditBundle.id, data as Partial<AgentBundle>);
          } else {
            addAgentBundle(data as Omit<AgentBundle, 'id' | 'createdAt' | 'updatedAt'>);
          }
          setShowOfferForm(false);
          setOfferAgent(null);
          setOfferEditBundle(null);
        }}
      />

      {/* Location Form */}
      <LocationFormModal
        visible={showLocationForm}
        editLocation={editLocation}
        colors={colors}
        onClose={() => { setShowLocationForm(false); setEditLocation(null); }}
        onSave={(data) => {
          if (editLocation) {
            updateSimLocation(editLocation.id, data as Partial<SimLocation>);
          } else {
            addSimLocation(data as Omit<SimLocation, 'id' | 'createdAt' | 'updatedAt'>);
          }
          setShowLocationForm(false);
          setEditLocation(null);
        }}
      />

      {/* Location Stock Form */}
      <LocationStockFormModal
        visible={showStockForm}
        location={stockLocation}
        editStock={editStock}
        simCards={simCards}
        companies={telecomCompanies}
        colors={colors}
        onClose={() => { setShowStockForm(false); setEditStock(null); setStockLocation(null); }}
        onSave={(data) => {
          if (editStock) {
            updateSimLocationStock(editStock.id, data as Partial<SimLocationStock>);
          } else {
            addSimLocationStock(data as Omit<SimLocationStock, 'id' | 'createdAt' | 'updatedAt'>);
          }
          setShowStockForm(false);
          setEditStock(null);
          setStockLocation(null);
        }}
      />

      {/* Delete confirms */}
      <ConfirmDialog
        visible={deleteTarget !== null}
        title={tab === 'sims' ? 'حذف الشريحة' : 'حذف الوكيل'}
        message={`هل تريد حذف "${deleteTarget?.name}"؟`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        visible={bundleDeleteTarget !== null}
        title="حذف حزمة الوكيل"
        message={`هل تريد حذف "${bundleDeleteTarget?.bundleName}"؟`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={() => { if (bundleDeleteTarget) deleteAgentBundle(bundleDeleteTarget.id); setBundleDeleteTarget(null); }}
        onCancel={() => setBundleDeleteTarget(null)}
      />
      <ConfirmDialog
        visible={locationDeleteTarget !== null}
        title="حذف النقطة"
        message={`هل تريد حذف "${locationDeleteTarget?.name}"؟ سيتم حذف توزيع الشرائح المرتبطة بها.`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={() => { if (locationDeleteTarget) deleteSimLocation(locationDeleteTarget.id); setLocationDeleteTarget(null); }}
        onCancel={() => setLocationDeleteTarget(null)}
      />

      {/* Shipment Form */}
      <ShipmentFormModal
        visible={showShipmentForm}
        suppliers={suppliers}
        subAgents={subAgents}
        colors={colors}
        currency={settings.currency}
        onClose={() => setShowShipmentForm(false)}
        onSave={(data) => {
          addShipment(data);
          setShowShipmentForm(false);
        }}
      />

      {/* Shipment Delete */}
      <ConfirmDialog
        visible={deleteShipmentTarget !== null}
        title="حذف الشحنة"
        message={`هل تريد حذف شحنة بقيمة ${formatCurrency(deleteShipmentTarget?.amount ?? 0, settings.currency)}؟ سيتم خصم المبلغ من رصيد الوكيل.`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={() => { if (deleteShipmentTarget) deleteShipment(deleteShipmentTarget.id); setDeleteShipmentTarget(null); }}
        onCancel={() => setDeleteShipmentTarget(null)}
      />
    </View>
  );
}

function MiniStat({ icon, label, value, colors }: { icon: React.ReactNode; label: string; value: string; colors: Colors }) {
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
      <Text style={[styles.detailChipLabel, { color }]}>{label}</Text>
      <Text style={[styles.detailChipValue, { color }]}>{value}</Text>
    </View>
  );
}

function TelecomFormModal({
  visible, tab, onClose, onSave, editItem, companies, suppliers, colors, currency,
}: {
  visible: boolean;
  tab: Tab;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  editItem: SubAgent | SimCard | null;
  companies: TelecomCompany[];
  suppliers: Supplier[];
  colors: Colors;
  currency: string;
}) {
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [simType, setSimType] = useState<SimType>('plastic');
  const [barcode, setBarcode] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [bundlePrice, setBundlePrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentNotes, setAgentNotes] = useState('');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [rechargeEnabled, setRechargeEnabled] = useState(false);
  const [rechargeThreshold, setRechargeThreshold] = useState('');
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierPhone, setSupplierPhone] = useState('');
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [error, setError] = useState('');
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      if (editItem && 'companyIds' in editItem) {
        setName(editItem.name);
        setAgentPhone(editItem.phone);
        setAgentNotes(editItem.notes);
        setSelectedCompanyIds(editItem.companyIds);
        setRechargeEnabled(editItem.rechargeEnabled ?? false);
        setRechargeThreshold(editItem.rechargeThreshold?.toString() ?? '');
        setRechargeAmount(editItem.rechargeAmount?.toString() ?? '');
        setSupplierId(editItem.supplierId ?? null);
        setSupplierPhone(editItem.supplierPhone ?? '');
      } else if (editItem && 'bundlePrice' in editItem) {
        setName(editItem.name);
        setCompanyId(editItem.companyId);
        setSimType(editItem.type);
        setBarcode(editItem.barcode);
        setCost(editItem.cost.toString());
        setPrice(editItem.price.toString());
        setBundlePrice(editItem.bundlePrice.toString());
        setStock(editItem.stock.toString());
        setMinStock(editItem.minStock.toString());
      } else {
        setName(''); setCompanyId(''); setSimType('plastic'); setBarcode('');
        setCost(''); setPrice(''); setBundlePrice(''); setStock(''); setMinStock('5');
        setAgentPhone(''); setAgentNotes(''); setSelectedCompanyIds([]);
        setRechargeEnabled(false); setRechargeThreshold(''); setRechargeAmount('');
        setSupplierId(null); setSupplierPhone('');
      }
      setError('');
    }
  }, [visible, editItem]);

  const companyName = companies.find((c) => c.id === companyId)?.name ?? '';

  const handleSave = () => {
    if (!name.trim()) { setError('الاسم مطلوب'); return; }

    if (tab === 'agents') {
      if (!agentPhone.trim()) { setError('رقم الهاتف مطلوب'); return; }
      onSave({
        name: name.trim(),
        phone: agentPhone.trim(),
        companyIds: selectedCompanyIds,
        notes: agentNotes.trim(),
        balance: editItem && 'balance' in editItem ? (editItem as SubAgent).balance : 0,
        active: editItem && 'active' in editItem ? (editItem as SubAgent).active : true,
        rechargeEnabled,
        rechargeThreshold: parseFloat(rechargeThreshold) || 0,
        rechargeAmount: parseFloat(rechargeAmount) || 0,
        supplierId,
        supplierPhone: supplierPhone.trim(),
      });
      return;
    }

    if (!companyId) { setError('اختر شركة الاتصالات'); return; }

    onSave({
      name: name.trim(),
      companyId,
      companyName,
      type: simType,
      barcode: barcode.trim() || Date.now().toString(),
      cost: parseFloat(cost) || 0,
      price: parseFloat(price) || 0,
      bundlePrice: parseFloat(bundlePrice) || 0,
      stock: parseInt(stock) || 0,
      minStock: parseInt(minStock) || 0,
      active: true,
    });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editItem ? (tab === 'sims' ? 'تعديل الشريحة' : 'تعديل الوكيل') : (tab === 'sims' ? 'شريحة جديدة' : 'وكيل جديد')}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{editItem ? 'حفظ' : 'إضافة'}</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <FormField label="الاسم" colors={colors}>
        <TextInput value={name} onChangeText={setName} placeholder={tab === 'sims' ? 'مثال: شريحة سيلكوم 50' : 'مثال: وكيل سيلكوم'} placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>

      {tab === 'agents' ? (
        <>
          <FormField label="رقم الهاتف" colors={colors}>
            <TextInput value={agentPhone} onChangeText={setAgentPhone} placeholder="05XXXXXXXX" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </FormField>
          <FormField label="الشركات المرتبطة" colors={colors}>
            <View style={{ gap: 6 }}>
              {companies.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedCompanyIds((prev) => prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id])}
                  style={[styles.pickerRow, { backgroundColor: selectedCompanyIds.includes(c.id) ? colors.info + '15' : colors.surfaceAlt, borderColor: selectedCompanyIds.includes(c.id) ? colors.info + '40' : 'transparent', borderWidth: 1 }]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.companyDot, { backgroundColor: c.color }]} />
                  <Text style={[styles.pickerRowText, { color: colors.text, flex: 1 }]}>{c.name}</Text>
                  {selectedCompanyIds.includes(c.id) && <Check size={18} color={colors.info} strokeWidth={2} />}
                </TouchableOpacity>
              ))}
            </View>
          </FormField>
          <FormField label="ملاحظات" colors={colors}>
            <TextInput value={agentNotes} onChangeText={setAgentNotes} placeholder="ملاحظات (اختياري)" placeholderTextColor={colors.textMuted} multiline style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60 }]} />
          </FormField>

          <View style={[styles.rechargeSection, { backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 14, marginTop: 4 }]}>
            <View style={styles.rechargeHeader}>
              <Text style={[styles.rechargeTitle, { color: colors.text }]}>إعدادات الشحن التلقائي</Text>
              <TouchableOpacity
                onPress={() => setRechargeEnabled((prev) => !prev)}
                style={[styles.toggleBtn, { backgroundColor: rechargeEnabled ? colors.success : colors.surface }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleText, { color: rechargeEnabled ? '#FFFFFF' : colors.textMuted }]}>
                  {rechargeEnabled ? 'مفعّل' : 'معطّل'}
                </Text>
              </TouchableOpacity>
            </View>

            {rechargeEnabled ? (
              <>
                <FormField label="رقم المورد (للإرسال)" colors={colors} style={{ marginTop: 8 }}>
                  <TouchableOpacity
                    onPress={() => setShowSupplierPicker(true)}
                    style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  >
                    <Text style={{ color: supplierId ? colors.text : colors.textMuted, fontSize: 15, flex: 1 }}>
                      {suppliers.find((s) => s.id === supplierId)?.name ?? 'اختر المورد'}
                    </Text>
                    <Text style={{ color: colors.textMuted }}>▼</Text>
                  </TouchableOpacity>
                </FormField>

                <FormField label="رقم هاتف المورد" colors={colors} style={{ marginTop: 8 }}>
                  <TextInput
                    value={supplierPhone}
                    onChangeText={setSupplierPhone}
                    placeholder="05XXXXXXXX"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  />
                </FormField>

                <View style={styles.formRow}>
                  <FormField label={`الحد الأدنى (${currency})`} colors={colors} style={{ flex: 1, marginTop: 8 }}>
                    <TextInput
                      value={rechargeThreshold}
                      onChangeText={setRechargeThreshold}
                      placeholder="50"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    />
                  </FormField>
                  <FormField label={`مبلغ الشحن (${currency})`} colors={colors} style={{ flex: 1, marginTop: 8 }}>
                    <TextInput
                      value={rechargeAmount}
                      onChangeText={setRechargeAmount}
                      placeholder="200"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    />
                  </FormField>
                </View>
              </>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <FormField label="شركة الاتصالات" colors={colors}>
            <TouchableOpacity onPress={() => setShowCompanyPicker(true)} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <Text style={{ color: companyName ? colors.text : colors.textMuted, fontSize: 15 }}>{companyName || 'اختر الشركة'}</Text>
              <Text style={{ color: colors.textMuted }}>▼</Text>
            </TouchableOpacity>
          </FormField>

          <FormField label="نوع الشريحة" colors={colors}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['plastic', 'electronic'] as SimType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setSimType(t)}
                  style={[styles.simTypeOption, simType === t ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: simType === t ? '#FFFFFF' : colors.textSecondary, fontWeight: '700' }}>
                    {t === 'plastic' ? 'بلاستيك' : 'إلكترونية'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormField>

          <FormField label="الباركود" colors={colors}>
            <TextInput value={barcode} onChangeText={setBarcode} placeholder="باركود الشريحة" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </FormField>

          <View style={styles.formRow}>
            <FormField label={`سعر الشريحة (${currency})`} colors={colors} style={{ flex: 1 }}>
              <TextInput value={price} onChangeText={setPrice} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </FormField>
            <FormField label={`سعر الحزمة (${currency})`} colors={colors} style={{ flex: 1 }}>
              <TextInput value={bundlePrice} onChangeText={setBundlePrice} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </FormField>
          </View>

          <View style={styles.formRow}>
            <FormField label={`التكلفة (${currency})`} colors={colors} style={{ flex: 1 }}>
              <TextInput value={cost} onChangeText={setCost} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </FormField>
            <FormField label="المخزون" colors={colors} style={{ flex: 1 }}>
              <TextInput value={stock} onChangeText={setStock} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </FormField>
            <FormField label="حد التنبيه" colors={colors} style={{ flex: 1 }}>
              <TextInput value={minStock} onChangeText={setMinStock} placeholder="5" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </FormField>
          </View>
        </>
      )}

      <BaseModal visible={showCompanyPicker} onClose={() => setShowCompanyPicker(false)} title="اختر الشركة">
        <ScrollView style={{ maxHeight: 400 }}>
          {companies.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => { setCompanyId(c.id); setShowCompanyPicker(false); }}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <View style={[styles.companyDot, { backgroundColor: c.color }]} />
              <Text style={[styles.pickerRowText, { color: colors.text }]}>{c.name}</Text>
              {companyId === c.id && <Text style={{ color: colors.primary }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BaseModal>

      {tab === 'agents' ? (
        <BaseModal visible={showSupplierPicker} onClose={() => setShowSupplierPicker(false)} title="اختر المورد">
          <ScrollView style={{ maxHeight: 400 }}>
            {suppliers.length === 0 ? (
              <Text style={[styles.noTxns, { color: colors.textMuted, textAlign: 'center', padding: 20 }]}>لا يوجد موردون. أضف موردين من تبويب الموردين.</Text>
            ) : suppliers.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => { setSupplierId(s.id); setSupplierPhone(s.phone); setShowSupplierPicker(false); }}
                style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerRowText, { color: colors.text, flex: 1 }]}>{s.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{s.phone}</Text>
                {supplierId === s.id && <Text style={{ color: colors.primary }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </BaseModal>
      ) : null}
    </BaseModal>
  );
}

function AgentBundleFormModal({
  visible, agent, editBundle, companies, colors, currency, onClose, onSave,
}: {
  visible: boolean;
  agent: SubAgent | null;
  editBundle: AgentBundle | null;
  companies: TelecomCompany[];
  colors: Colors;
  currency: string;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [bundleName, setBundleName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [cost, setCost] = useState('');
  const [monthPrice, setMonthPrice] = useState('');
  const [error, setError] = useState('');
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      if (editBundle) {
        setBundleName(editBundle.bundleName);
        setCompanyId(editBundle.companyId);
        setCost(editBundle.cost?.toString() || '');
      } else {
        setBundleName(''); setCompanyId(''); setCost('');
      }
      setError('');
    }
  }, [visible, editBundle]);

  const agentCompanies = agent ? companies.filter((c) => agent.companyIds.includes(c.id)) : companies;
  const companyName = companies.find((c) => c.id === companyId)?.name ?? '';

  const handleSave = () => {
    if (!bundleName.trim()) { setError('اسم الحزمة مطلوب'); return; }
    if (!companyId) { setError('اختر شركة الاتصالات'); return; }
    const mp = parseFloat(monthPrice) || 0;
    if (mp <= 0) { setError('سعر البيع مطلوب'); return; }
    onSave({
      subAgentId: agent?.id ?? editBundle?.subAgentId ?? '',
      companyId,
      companyName,
      bundleName: bundleName.trim(),
      cost: parseFloat(cost) || 0,
      prices: { month: mp },
      bundleType: 'monthly',
      active: true,
    });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editBundle ? 'تعديل حزمة الوكيل' : 'حزمة جديدة للوكيل'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.accent }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{editBundle ? 'حفظ' : 'إضافة'}</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <FormField label="اسم الحزمة" colors={colors}>
        <TextInput value={bundleName} onChangeText={setBundleName} placeholder="مثال: حزمة 50 شيكل" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>

      <FormField label="شركة الاتصالات" colors={colors}>
        <TouchableOpacity onPress={() => setShowCompanyPicker(true)} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={{ color: companyName ? colors.text : colors.textMuted, fontSize: 15 }}>{companyName || 'اختر الشركة'}</Text>
          <Text style={{ color: colors.textMuted }}>▼</Text>
        </TouchableOpacity>
      </FormField>

      <FormField label={`سعر الجملة (${currency})`} colors={colors}>
        <TextInput value={cost} onChangeText={setCost} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>

      <FormField label={`سعر البيع (${currency})`} colors={colors}>
        <TextInput value={monthPrice} onChangeText={setMonthPrice} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>

      <BaseModal visible={showCompanyPicker} onClose={() => setShowCompanyPicker(false)} title="اختر الشركة">
        <ScrollView style={{ maxHeight: 400 }}>
          {agentCompanies.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => { setCompanyId(c.id); setShowCompanyPicker(false); }}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <View style={[styles.companyDot, { backgroundColor: c.color }]} />
              <Text style={[styles.pickerRowText, { color: colors.text }]}>{c.name}</Text>
              {companyId === c.id && <Text style={{ color: colors.accent }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BaseModal>
    </BaseModal>
  );
}

function AgentOfferFormModal({
  visible, agent, editBundle, companies, colors, currency, onClose, onSave,
}: {
  visible: boolean;
  agent: SubAgent | null;
  editBundle: AgentBundle | null;
  companies: TelecomCompany[];
  colors: Colors;
  currency: string;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [bundleName, setBundleName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [cost, setCost] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [offerType, setOfferType] = useState<'new_number' | 'renewal'>('new_number');
  const [error, setError] = useState('');
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      if (editBundle) {
        setBundleName(editBundle.bundleName);
        setCompanyId(editBundle.companyId);
        setCost(editBundle.cost?.toString() || '');
        const sp = editBundle.prices?.['3_months'];
        setSellingPrice(sp !== undefined && sp !== null ? sp.toString() : '');
        setOfferType(editBundle.offerType ?? 'new_number');
      } else {
        setBundleName(''); setCompanyId(''); setCost(''); setSellingPrice(''); setOfferType('new_number');
      }
      setError('');
    }
  }, [visible, editBundle]);

  const agentCompanies = agent ? companies.filter((c) => agent.companyIds.includes(c.id)) : companies;
  const companyName = companies.find((c) => c.id === companyId)?.name ?? '';

  const handleSave = () => {
    if (!companyId) { setError('اختر شركة الاتصالات'); return; }
    const sp = parseFloat(sellingPrice) || 0;
    if (sp <= 0) { setError('سعر البيع مطلوب'); return; }
    const c = parseFloat(cost) || 0;
    if (c <= 0) { setError('سعر الجملة (التكلفة) مطلوب'); return; }
    const typeLabel = offerType === 'new_number' ? 'رقم جديد' : 'تجديد';
    const name = bundleName.trim() || `عرض 3 شهور ${typeLabel} - ${companyName}`;
    const prices: Record<string, number> = { '3_months': sp };
    onSave({
      subAgentId: agent?.id ?? editBundle?.subAgentId ?? '',
      companyId,
      companyName,
      bundleName: name,
      cost: c,
      prices,
      bundleType: 'offer',
      offerType,
      active: true,
    });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editBundle?.prices?.['3_months'] != null ? 'تعديل عرض 3 شهور' : 'عرض 3 شهور جديد'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.success }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{editBundle?.prices?.['3_months'] != null ? 'حفظ' : 'إضافة'}</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <FormField label="شركة الاتصالات" colors={colors}>
        <TouchableOpacity onPress={() => setShowCompanyPicker(true)} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={{ color: companyName ? colors.text : colors.textMuted, fontSize: 15 }}>{companyName || 'اختر الشركة'}</Text>
          <Text style={{ color: colors.textMuted }}>▼</Text>
        </TouchableOpacity>
      </FormField>

      <FormField label={`سعر التكلفة / الشراء (${currency})`} colors={colors}>
        <TextInput value={cost} onChangeText={setCost} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>

      <FormField label={`سعر البيع للزبون - 3 شهور (${currency})`} colors={colors}>
        <TextInput value={sellingPrice} onChangeText={setSellingPrice} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>

      <FormField label="النوع" colors={colors}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setOfferType('new_number')}
            style={[styles.textInput, { flex: 1, backgroundColor: offerType === 'new_number' ? colors.success + '15' : colors.surfaceAlt, borderColor: offerType === 'new_number' ? colors.success : colors.border, alignItems: 'center', justifyContent: 'center' }]}
            activeOpacity={0.7}
          >
            <Text style={{ color: offerType === 'new_number' ? colors.success : colors.textMuted, fontSize: 14, fontWeight: '600' }}>رقم جديد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOfferType('renewal')}
            style={[styles.textInput, { flex: 1, backgroundColor: offerType === 'renewal' ? colors.success + '15' : colors.surfaceAlt, borderColor: offerType === 'renewal' ? colors.success : colors.border, alignItems: 'center', justifyContent: 'center' }]}
            activeOpacity={0.7}
          >
            <Text style={{ color: offerType === 'renewal' ? colors.success : colors.textMuted, fontSize: 14, fontWeight: '600' }}>تجديد</Text>
          </TouchableOpacity>
        </View>
      </FormField>

      <BaseModal visible={showCompanyPicker} onClose={() => setShowCompanyPicker(false)} title="اختر الشركة">
        <ScrollView style={{ maxHeight: 400 }}>
          {agentCompanies.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => { setCompanyId(c.id); setShowCompanyPicker(false); }}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <View style={[styles.companyDot, { backgroundColor: c.color }]} />
              <Text style={[styles.pickerRowText, { color: colors.text }]}>{c.name}</Text>
              {companyId === c.id && <Text style={{ color: colors.success }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BaseModal>
    </BaseModal>
  );
}

function LocationFormModal({
  visible, editLocation, colors, onClose, onSave,
}: {
  visible: boolean;
  editLocation: SimLocation | null;
  colors: Colors;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(editLocation?.name ?? '');
      setNotes(editLocation?.notes ?? '');
      setError('');
    }
  }, [visible, editLocation]);

  const handleSave = () => {
    if (!name.trim()) { setError('اسم النقطة مطلوب'); return; }
    onSave({ name: name.trim(), notes: notes.trim(), active: true });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editLocation ? 'تعديل النقطة' : 'نقطة جديدة'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{editLocation ? 'حفظ' : 'إضافة'}</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <FormField label="اسم النقطة" colors={colors}>
        <TextInput value={name} onChangeText={setName} placeholder="مثال: فرع المدينة" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>
      <FormField label="ملاحظات" colors={colors}>
        <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات (اختياري)" placeholderTextColor={colors.textMuted} multiline style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60 }]} />
      </FormField>
    </BaseModal>
  );
}

function LocationStockFormModal({
  visible, location, editStock, simCards, companies, colors, onClose, onSave,
}: {
  visible: boolean;
  location: SimLocation | null;
  editStock: SimLocationStock | null;
  simCards: SimCard[];
  companies: TelecomCompany[];
  colors: Colors;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [simCardId, setSimCardId] = useState('');
  const [stock, setStock] = useState('');
  const [error, setError] = useState('');
  const [showSimPicker, setShowSimPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setSimCardId(editStock?.simCardId ?? '');
      setStock(editStock?.stock?.toString() ?? '');
      setError('');
    }
  }, [visible, editStock]);

  const selectedSim = simCards.find((s) => s.id === simCardId);
  const handleSave = () => {
    if (!simCardId) { setError('اختر الشريحة'); return; }
    if (!stock.trim() || parseInt(stock) < 0) { setError('أدخل كمية صحيحة'); return; }
    const company = companies.find((c) => c.id === selectedSim?.companyId);
    onSave({
      locationId: location?.id ?? editStock?.locationId ?? '',
      simCardId,
      companyId: selectedSim?.companyId ?? '',
      companyName: company?.name ?? selectedSim?.companyName ?? '',
      simName: selectedSim?.name ?? '',
      stock: parseInt(stock) || 0,
    });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editStock ? 'تعديل التوزيع' : 'توزيع شريحة'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{editStock ? 'حفظ' : 'إضافة'}</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <FormField label="الشريحة" colors={colors}>
        <TouchableOpacity onPress={() => setShowSimPicker(true)} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={{ color: selectedSim ? colors.text : colors.textMuted, fontSize: 15 }}>{selectedSim ? `${selectedSim.companyName} - ${selectedSim.name}` : 'اختر الشريحة'}</Text>
          <Text style={{ color: colors.textMuted }}>▼</Text>
        </TouchableOpacity>
      </FormField>
      <FormField label="الكمية" colors={colors}>
        <TextInput value={stock} onChangeText={setStock} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>

      <BaseModal visible={showSimPicker} onClose={() => setShowSimPicker(false)} title="اختر الشريحة">
        <ScrollView style={{ maxHeight: 400 }}>
          {simCards.filter((s) => s.type === 'plastic').map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => { setSimCardId(s.id); setShowSimPicker(false); }}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Signal size={18} color={colors.primary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerRowText, { color: colors.text }]}>{s.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>{s.companyName} - مخزون: {s.stock}</Text>
              </View>
              {simCardId === s.id && <Check size={18} color={colors.primary} strokeWidth={2} />}
            </TouchableOpacity>
          ))}
          {simCards.filter((s) => s.type === 'plastic').length === 0 && (
            <Text style={[styles.noResultsText, { color: colors.textMuted }]}>لا توجد شرائح بلاستيك</Text>
          )}
        </ScrollView>
      </BaseModal>
    </BaseModal>
  );
}

function FormField({ label, children, colors, style }: { label: string; children: React.ReactNode; colors: Colors; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

function ShipmentFormModal({ visible, suppliers, subAgents, colors, currency, onClose, onSave }: {
  visible: boolean;
  suppliers: Supplier[];
  subAgents: SubAgent[];
  colors: Colors;
  currency: string;
  onClose: () => void;
  onSave: (data: { supplierId: string; supplierName: string; subAgentId: string; subAgentName: string; amount: number; notes: string }) => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [subAgentId, setSubAgentId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setSupplierId(''); setSubAgentId(''); setAmount(''); setNotes(''); setError('');
    }
  }, [visible]);

  const supplier = suppliers.find((s) => s.id === supplierId);
  const agent = subAgents.find((a) => a.id === subAgentId);

  const handleSave = () => {
    if (!supplierId) { setError('اختر المورد'); return; }
    if (!subAgentId) { setError('اختر الوكيل'); return; }
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { setError('أدخل مبلغ صحيح'); return; }
    onSave({
      supplierId,
      supplierName: supplier?.name ?? '',
      subAgentId,
      subAgentName: agent?.name ?? '',
      amount: amt,
      notes: notes.trim(),
    });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="تسجيل شحنة"
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.success }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>تسجيل</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <FormField label="المورد" colors={colors}>
        <TouchableOpacity onPress={() => setShowSupplierPicker(true)} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={{ color: supplier ? colors.text : colors.textMuted, fontSize: 15 }}>{supplier?.name ?? 'اختر المورد'}</Text>
          <Text style={{ color: colors.textMuted }}>▼</Text>
        </TouchableOpacity>
      </FormField>
      <FormField label="الوكيل" colors={colors}>
        <TouchableOpacity onPress={() => setShowAgentPicker(true)} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={{ color: agent ? colors.text : colors.textMuted, fontSize: 15 }}>{agent?.name ?? 'اختر الوكيل'}</Text>
          <Text style={{ color: colors.textMuted }}>▼</Text>
        </TouchableOpacity>
        {agent && (
          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>الرصيد الحالي: {formatCurrency(agent.balance, currency)}</Text>
        )}
      </FormField>
      <FormField label={`المبلغ (${currency})`} colors={colors}>
        <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>
      <FormField label="ملاحظات" colors={colors}>
        <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات (اختياري)" placeholderTextColor={colors.textMuted} multiline style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60 }]} />
      </FormField>

      <BaseModal visible={showSupplierPicker} onClose={() => setShowSupplierPicker(false)} title="اختر المورد">
        <ScrollView style={{ maxHeight: 400 }}>
          {suppliers.length === 0 ? (
            <Text style={[styles.noResultsText, { color: colors.textMuted }]}>لا يوجد موردون. أضف مورداً أولاً.</Text>
          ) : suppliers.map((s) => (
            <TouchableOpacity key={s.id} onPress={() => { setSupplierId(s.id); setShowSupplierPicker(false); }} style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]} activeOpacity={0.7}>
              <Truck size={18} color={colors.accent} strokeWidth={2} />
              <Text style={[styles.pickerRowText, { color: colors.text }]}>{s.name}</Text>
              {supplierId === s.id && <Check size={18} color={colors.accent} strokeWidth={2} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BaseModal>
      <BaseModal visible={showAgentPicker} onClose={() => setShowAgentPicker(false)} title="اختر الوكيل">
        <ScrollView style={{ maxHeight: 400 }}>
          {subAgents.length === 0 ? (
            <Text style={[styles.noResultsText, { color: colors.textMuted }]}>لا يوجد وكلاء. أضف وكيلاً أولاً.</Text>
          ) : subAgents.map((a) => (
            <TouchableOpacity key={a.id} onPress={() => { setSubAgentId(a.id); setShowAgentPicker(false); }} style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]} activeOpacity={0.7}>
              <User size={18} color={colors.info} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerRowText, { color: colors.text }]}>{a.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>الرصيد: {formatCurrency(a.balance, currency)}</Text>
              </View>
              {subAgentId === a.id && <Check size={18} color={colors.success} strokeWidth={2} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BaseModal>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  miniStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniStatInfo: { gap: 1 },
  miniStatLabel: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  miniStatValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  divider: { width: 1, height: 28, marginHorizontal: 4 },
  tabBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 10 },
  tabText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  searchArea: { paddingHorizontal: 16, paddingBottom: 8 },
  emptyWrap: { flex: 1 },
  card: { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  simTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  simTypeText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  bundleBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', lineHeight: 20 },
  cardCompany: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  cardActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardDetails: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  detailChip: { flex: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  detailChipLabel: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  detailChipValue: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  fab: { position: 'absolute', bottom: 80, right: 16, width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  // Bundles section in agent card
  bundlesSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 8 },
  bundlesSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bundlesSectionTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  addBundleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  addBundleText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  noBundlesText: { fontSize: 13, fontFamily: 'Cairo-Regular', paddingVertical: 6 },
  agentBundleCard: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 8 },
  desktopBundleRow: { flexDirection: 'row', gap: 10, paddingVertical: 2 },
  desktopAgentBundleCard: { width: 260, minHeight: 158 },
  agentBundleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agentBundleName: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  priceChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 2 },
  priceChipLabel: { fontSize: 10, fontFamily: 'Cairo-Regular' },
  priceChipValue: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  // Distribution section in sim card
  distSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 4 },
  distHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  distTitle: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  distTotal: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  distRowName: { fontSize: 12, flex: 1, fontFamily: 'Cairo-Regular' },
  distRowQty: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  noDistText: { fontSize: 11, fontFamily: 'Cairo-Regular', paddingVertical: 4 },
  // Locations card
  locationsCard: { borderRadius: 16, padding: 14, gap: 10 },
  locationsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locationsTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  addLocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  addLocText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  noLocText: { fontSize: 13, fontFamily: 'Cairo-Regular', paddingVertical: 8, textAlign: 'center' },
  locItem: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 6 },
  locItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locName: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  locTotal: { fontSize: 11, marginTop: 2, fontFamily: 'Cairo-Regular' },
  locStockList: { gap: 6, marginTop: 4 },
  locStockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  locStockName: { fontSize: 13, flex: 1, fontFamily: 'Cairo-Regular' },
  locStockQty: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  addStockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
  addStockText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  noResultsText: { textAlign: 'center', paddingVertical: 20, fontSize: 14, fontFamily: 'Cairo-Regular' },
  // Form
  errorBox: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center', fontFamily: 'Cairo-SemiBold' },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, fontFamily: 'Cairo-SemiBold' },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15, fontFamily: 'Cairo-Regular' },
  formRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  simTypeOption: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 6 },
  pickerRowText: { fontSize: 15, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  companyDot: { width: 14, height: 14, borderRadius: 7 },
  // Price form

  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 8 },
  rechargeSection: { gap: 4 },
  rechargeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rechargeTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  toggleText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  noTxns: { fontSize: 13, fontFamily: 'Cairo-Regular' },
});
