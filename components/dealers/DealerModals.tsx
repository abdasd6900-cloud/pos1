import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import {
  Search, AlertCircle, Check, MessageSquare, Image as ImageIcon,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { BaseModal } from '@/components/BaseModal';
import { dealerStyles as styles } from './styles';
import type { Customer, TelecomSale } from '@/types';
import type { RechargeRequest, PricingEntry, EsimRequest } from './types';

export function AddDealerModal({ visible, onClose, onCreated, colors, ownerId }: { visible: boolean; onClose: () => void; onCreated: () => void; colors: any; ownerId: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      void storage.getCustomers().then((c) => setCustomers(c));
    } else {
      setName(''); setPhone(''); setPassword(''); setCreditLimit('0');
      setShowCustomerList(false); setCustomerSearch('');
      setSelectedCustomerId(null);
      setImportedCount(null);
      setError('');
    }
  }, [visible]);

  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.trim().toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const selectCustomer = (c: Customer) => {
    setName(c.name);
    setPhone(c.phone);
    setSelectedCustomerId(c.id);
    setShowCustomerList(false);
    setCustomerSearch('');
  };

  const handleCreate = async () => {
    if (!name.trim() || !phone.trim() || !password.trim()) {
      setError('جميع الحقول مطلوبة');
      return;
    }
    setCreating(true);
    setError('');

    try {
      // Hash password (same algorithm as edge function)
      const encoder = new TextEncoder();
      const data = encoder.encode(password + 'sahab-dealer-salt-v1');
      const hash = await crypto.subtle.digest('SHA-256', data);
      const passwordHash = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');

      const { data: inserted, error: insertError } = await supabase.from('dealers').insert({
        owner_user_id: ownerId,
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        password_hash: passwordHash,
        credit_limit: parseFloat(creditLimit) || 0,
      }).select('id').single();

      if (insertError || !inserted) {
        setError('تعذر إنشاء الموزع');
        return;
      }

      const dealerId = inserted.id;

      // If a customer was selected, import all their phone numbers
      if (selectedCustomerId) {
        const [telecomSales, transactions] = await Promise.all([
          storage.getTelecomSales(),
          storage.getTransactions(),
        ]);

        // Collect unique phone numbers associated with this customer
        const phoneSet = new Map<string, { name: string; company?: string }>();

        // From telecom sales
        (telecomSales as TelecomSale[]).forEach((sale) => {
          if (sale.customerId === selectedCustomerId && sale.customerPhone) {
            const cleanPhone = sale.customerPhone.replace(/\D/g, '');
            if (cleanPhone && !phoneSet.has(cleanPhone)) {
              phoneSet.set(cleanPhone, { name: sale.customerName || name.trim(), company: sale.companyName });
            }
          }
        });

        // From transactions (customerName matches)
        transactions.forEach((txn) => {
          if (txn.customerId === selectedCustomerId && txn.customerName) {
            // Transactions don't carry phone directly, but the customer record does
          }
        });

        // Include the customer's own phone if not already included
        const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
        if (selectedCustomer?.phone) {
          const cleanPhone = selectedCustomer.phone.replace(/\D/g, '');
          if (cleanPhone && !phoneSet.has(cleanPhone)) {
            phoneSet.set(cleanPhone, { name: selectedCustomer.name });
          }
        }

        // Insert all collected numbers as dealer_customers
        const rows = Array.from(phoneSet.entries()).map(([phoneNumber, info]) => ({
          dealer_id: dealerId,
          phone_number: phoneNumber,
          customer_name: info.name,
          company_name: info.company || null,
          status: 'active',
        }));

        if (rows.length > 0) {
          const { error: custError } = await supabase.from('dealer_customers').insert(rows);
          if (custError) {
            // Dealer was created but customer import failed — not fatal
            setImportedCount(0);
          } else {
            setImportedCount(rows.length);
          }
        }
      }

      setName(''); setPhone(''); setPassword(''); setCreditLimit('0');
      setSelectedCustomerId(null);
      onCreated();
    } catch {
      setError('حدث خطأ غير متوقع أثناء إنشاء الموزع');
    } finally {
      setCreating(false);
    }
  };

  return (
    <BaseModal visible={visible} onClose={onClose} title="إضافة موزع جديد"
      footer={
        <TouchableOpacity onPress={handleCreate} disabled={creating} style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: creating ? 0.6 : 1 }]}>
          {creating ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitText}>إنشاء</Text>}
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', marginBottom: 12 }]}>
          <AlertCircle size={18} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        {/* Customer picker */}
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>اختيار من الزبائن</Text>
          <TouchableOpacity
            onPress={() => setShowCustomerList(!showCustomerList)}
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          >
            <Text style={{ fontSize: 15, fontFamily: 'Cairo-Regular', color: showCustomerList ? colors.primary : colors.textMuted }}>
              {showCustomerList ? 'إخفاء القائمة' : 'إظهار قائمة الزبائن'}
            </Text>
            <Search size={16} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {showCustomerList && (
          <View style={{ gap: 6 }}>
            <View style={[styles.textInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }]}>
              <Search size={16} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                value={customerSearch}
                onChangeText={setCustomerSearch}
                placeholder="ابحث بالاسم أو الهاتف..."
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, fontSize: 14, fontFamily: 'Cairo-Regular', color: colors.text, paddingVertical: 4 }}
              />
            </View>
            <View style={{ maxHeight: 200, borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' }}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                {filteredCustomers.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Cairo-Regular', color: colors.textMuted }}>لا يوجد زبائن مطابقون</Text>
                  </View>
                ) : (
                  filteredCustomers.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => selectCustomer(c)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + '40' }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold', color: colors.primary }}>{c.name.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Cairo-SemiBold', color: colors.text }}>{c.name}</Text>
                        <Text style={{ fontSize: 12, fontFamily: 'Cairo-Regular', color: colors.textMuted }}>{c.phone}</Text>
                      </View>
                      {c.tier === 'vip' && (
                        <View style={{ backgroundColor: colors.warning + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', fontFamily: 'Cairo-Bold', color: colors.warning }}>VIP</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {selectedCustomerId && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.success + '15', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Check size={16} color={colors.success} strokeWidth={2} />
            <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Cairo-Regular', color: colors.success }}>
              سيتم استيراد جميع أرقام هذا الزبون تلقائياً إلى صفحة الموزع
            </Text>
          </View>
        )}

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>اسم الموزع</Text>
          <TextInput value={name} onChangeText={setName} placeholder="اسم الموزع" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رقم الهاتف</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="05XXXXXXXX" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>كلمة المرور</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.textMuted} secureTextEntry style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>سقف الدين (₪)</Text>
          <TextInput value={creditLimit} onChangeText={setCreditLimit} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
      </View>
    </BaseModal>
  );
}

export function PricingModal({ visible, onClose, onSaved, colors, ownerId, editing }: { visible: boolean; onClose: () => void; onSaved: () => void; colors: any; ownerId: string; editing: PricingEntry | null }) {
  const [company, setCompany] = useState(editing?.company_name || '');
  const [bundle, setBundle] = useState(editing?.bundle_name || '');
  const [bundleType, setBundleType] = useState(editing?.bundle_type || 'monthly');
  const [dealerPrice, setDealerPrice] = useState(String(editing?.dealer_price ?? '0'));
  const [salePrice, setSalePrice] = useState(String(editing?.sale_price ?? '0'));
  const [duration, setDuration] = useState(String(editing?.duration_days || '30'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setCompany(editing?.company_name || '');
      setBundle(editing?.bundle_name || '');
      setBundleType(editing?.bundle_type || 'monthly');
      setDealerPrice(String(editing?.dealer_price ?? '0'));
      setSalePrice(String(editing?.sale_price ?? '0'));
      setDuration(String(editing?.duration_days || '30'));
      setError('');
    }
  }, [visible, editing]);

  const handleSave = async () => {
    if (!company.trim() || !bundle.trim()) { setError('الشركة واسم الحزمة مطلوبة'); return; }
    setSaving(true);
    setError('');

    try {
      if (editing) {
        const { error: updateError } = await supabase.from('dealer_pricing').update({
          dealer_price: parseFloat(dealerPrice) || 0,
          sale_price: parseFloat(salePrice) || 0,
          updated_at: new Date().toISOString(),
        }).eq('id', editing.id);
        if (updateError) { setError('تعذر التحديث'); return; }
      } else {
        const body = {
          owner_user_id: ownerId,
          company_name: company.trim(),
          bundle_name: bundle.trim(),
          bundle_type: bundleType,
          dealer_price: parseFloat(dealerPrice) || 0,
          sale_price: parseFloat(salePrice) || 0,
          cost: 0,
          duration_days: parseInt(duration) || 30,
          active: true,
        };
        const { error: insertError } = await supabase.from('dealer_pricing').insert(body);
        if (insertError) { setError('تعذر الإضافة'); return; }
      }
      onSaved();
    } catch {
      setError('حدث خطأ غير متوقع');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal visible={visible} onClose={onClose} title={editing ? 'تعديل تسعير الحزمة' : 'إضافة تسعير جديد'}
      footer={
        <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
          {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitText}>حفظ</Text>}
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', marginBottom: 12 }]}>
          <AlertCircle size={18} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        {editing ? (
          <View style={[styles.reqDetailBox, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.reqDetailText, { color: colors.text }]}>الشركة: {editing.company_name}</Text>
            <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الحزمة: {editing.bundle_name}</Text>
            <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>المدة: {editing.duration_days} يوم — {editing.bundle_type === 'offer' ? 'عرض خاص' : 'شهري'}</Text>
          </View>
        ) : (
          <>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>الشركة</Text>
              <TextInput value={company} onChangeText={setCompany} placeholder="سيلكوم، بيلفون..." style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </View>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>اسم الحزمة</Text>
              <TextInput value={bundle} onChangeText={setBundle} placeholder="حزمة 29..." style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </View>
            <View style={styles.planSelector}>
              {(['monthly', 'offer'] as const).map((t) => (
                <TouchableOpacity key={t} onPress={() => setBundleType(t)} style={[styles.planBtn, bundleType === t ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <Text style={[styles.planText, { color: bundleType === t ? '#FFFFFF' : colors.textSecondary }]}>{t === 'monthly' ? 'شهري' : 'عرض'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>المدة (أيام)</Text>
              <TextInput value={duration} onChangeText={setDuration} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </View>
          </>
        )}
        <View style={styles.priceRowModal}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>سعر الموزع (تكلفته)</Text>
            <TextInput value={dealerPrice} onChangeText={setDealerPrice} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>سعر البيع للموزع</Text>
            <TextInput value={salePrice} onChangeText={setSalePrice} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
        </View>
      </View>
    </BaseModal>
  );
}

export function ProcessRequestModal({ req, dealerName, colors, onClose, onProcess }: { req: RechargeRequest | null; dealerName: string; colors: any; onClose: () => void; onProcess: (req: RechargeRequest, action: 'approve' | 'reject' | 'complete', extra?: { reply?: string; phoneAssigned?: string }) => void }) {
  const [action, setAction] = useState<'approve' | 'reject' | 'complete'>('approve');
  const [reply, setReply] = useState('');
  const [phoneAssigned, setPhoneAssigned] = useState('');

  useEffect(() => {
    if (req) {
      setReply(req.owner_reply || '');
      setPhoneAssigned(req.phone_number_assigned || '');
      setAction(req.status === 'completed' ? 'complete' : req.status === 'approved' ? 'complete' : 'approve');
    }
  }, [req]);

  if (!req) return null;

  return (
    <BaseModal visible={req !== null} onClose={onClose} title={`معالجة طلب: ${req.customer_name}`}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {req.status === 'pending' && (
            <TouchableOpacity onPress={() => onProcess(req, 'reject', { reply })} style={[styles.submitBtn, { backgroundColor: colors.danger, flex: 1 }]}>
              <Text style={styles.submitText}>رفض</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onProcess(req, action, { reply, phoneAssigned })} style={[styles.submitBtn, { backgroundColor: colors.success, flex: 1 }]}>
            <Text style={styles.submitText}>{action === 'complete' ? 'استكمال' : 'موافقة'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <View style={[styles.reqDetailBox, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.reqDetailText, { color: colors.text }]}>الموزع: {dealerName}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الشركة: {req.company_name}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الحزمة: {req.bundle_name}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>المدة: {req.duration}</Text>
          {req.sim_number && <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>رقم الشريحة: {req.sim_number}</Text>}
          <Text style={[styles.reqDetailText, { color: colors.accent }]}>سعر البيع: ₪{Number(req.sale_price).toFixed(2)}</Text>
        </View>

        {req.sms_message && (
          <View style={[styles.replyBox, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
            <MessageSquare size={14} color={colors.info} strokeWidth={2} />
            <Text style={[styles.replyText, { color: colors.info }]}>رسالة SMS: {req.sms_message}</Text>
          </View>
        )}

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رقم الهاتف المفعّل (لاستكمال العملية)</Text>
          <TextInput value={phoneAssigned} onChangeText={setPhoneAssigned} placeholder="رقم الهاتف الجديد" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رد على الموزع</Text>
          <TextInput value={reply} onChangeText={setReply} placeholder="مثال: اعتذر عن الشحن الآن لعدم توفر رصيد، سيتم شحنه غداً" placeholderTextColor={colors.textMuted} multiline style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60 }]} />
        </View>
      </View>
    </BaseModal>
  );
}

export function ProcessEsimModal({ req, dealerName, colors, onClose, onProcess }: { req: EsimRequest | null; dealerName: string; colors: any; onClose: () => void; onProcess: (req: EsimRequest, action: 'complete' | 'reject', extra?: { reply?: string; phoneAssigned?: string; barcodeUrl?: string }) => void }) {
  const [phoneAssigned, setPhoneAssigned] = useState('');
  const [barcodeUrl, setBarcodeUrl] = useState('');
  const [reply, setReply] = useState('');

  useEffect(() => {
    if (req) {
      setPhoneAssigned(req.phone_number_assigned || '');
      setBarcodeUrl(req.barcode_image_url || '');
      setReply(req.owner_reply || '');
    }
  }, [req]);

  if (!req) return null;

  return (
    <BaseModal visible={req !== null} onClose={onClose} title={`معالجة eSIM: ${req.customer_name}`}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {req.status === 'pending' && (
            <TouchableOpacity onPress={() => onProcess(req, 'reject', { reply })} style={[styles.submitBtn, { backgroundColor: colors.danger, flex: 1 }]}>
              <Text style={styles.submitText}>رفض</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onProcess(req, 'complete', { reply, phoneAssigned, barcodeUrl })} style={[styles.submitBtn, { backgroundColor: colors.success, flex: 1 }]}>
            <Text style={styles.submitText}>{req.status === 'completed' ? 'تحديث' : 'استكمال'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <View style={[styles.reqDetailBox, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.reqDetailText, { color: colors.text }]}>الموزع: {dealerName}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الشركة: {req.company_name}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الحزمة: {req.bundle_name}</Text>
          {req.contact_phone && <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>رقم التواصل: {req.contact_phone}</Text>}
          <Text style={[styles.reqDetailText, { color: colors.accent }]}>سعر البيع: ₪{Number(req.sale_price).toFixed(2)}</Text>
        </View>

        {req.barcode_image_url && req.status === 'completed' && (
          <View style={[styles.replyBox, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
            <ImageIcon size={14} color={colors.info} strokeWidth={2} />
            <Text style={[styles.replyText, { color: colors.info }]}>باركود حالي: {req.barcode_image_url}</Text>
          </View>
        )}

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رقم الهاتف المفعّل</Text>
          <TextInput value={phoneAssigned} onChangeText={setPhoneAssigned} placeholder="رقم الهاتف الجديد" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رابط صورة الباركود</Text>
          <TextInput value={barcodeUrl} onChangeText={setBarcodeUrl} placeholder="https://..." placeholderTextColor={colors.textMuted} keyboardType="url" autoCapitalize="none" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رد على الموزع</Text>
          <TextInput value={reply} onChangeText={setReply} placeholder="رد اختياري..." placeholderTextColor={colors.textMuted} multiline style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60 }]} />
        </View>
      </View>
    </BaseModal>
  );
}
