import { useState, useCallback, memo } from 'react';
import {
  StyleSheet, Text, TouchableOpacity, View, Modal, Clipboard,
  Linking, Platform, Alert,
} from 'react-native';
import { Copy, Check, Phone, MessageSquare, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';

const PHONE_REGEX = /(\+?\d[\d\s\-()]{6,}\d)/g;

interface PhoneSegment {
  text: string;
  isPhone: boolean;
}

function parseText(text: string): PhoneSegment[] {
  const segments: PhoneSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(PHONE_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isPhone: false });
    }
    const raw = match[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      segments.push({ text: raw, isPhone: true });
    } else {
      segments.push({ text: raw, isPhone: false });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isPhone: false });
  }
  return segments;
}

interface PhoneNumberTextProps {
  text: string;
  color: string;
  style?: any;
}

function PhoneNumberTextInner({ text, color, style }: PhoneNumberTextProps) {
  const { colors } = useTheme();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const segments = parseText(text);

  const handlePhonePress = useCallback((phone: string) => {
    setSelectedPhone(phone);
  }, []);

  const handleCopy = useCallback(async () => {
    if (selectedPhone) {
      await Clipboard.setString(selectedPhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [selectedPhone]);

  const handleCall = useCallback(() => {
    if (selectedPhone) {
      const clean = selectedPhone.replace(/\s/g, '');
      Linking.openURL(`tel:${clean}`).catch(() => {
        Alert.alert('غير متاح', 'لا يمكن إجراء مكالمة على هذا الجهاز');
      });
      setSelectedPhone(null);
    }
  }, [selectedPhone]);

  const handleSms = useCallback(() => {
    if (selectedPhone) {
      const clean = selectedPhone.replace(/\s/g, '');
      Linking.openURL(`sms:${clean}`).catch(() => {
        Alert.alert('غير متاح', 'لا يمكن فتح شاشة الرسائل على هذا الجهاز');
      });
      setSelectedPhone(null);
    }
  }, [selectedPhone]);

  return (
    <>
      <Text style={style}>
        {segments.map((seg, i) =>
          seg.isPhone ? (
            <Text
              key={i}
              style={{ color: colors.info, textDecorationLine: 'underline' }}
              onPress={() => handlePhonePress(seg.text)}
            >
              {seg.text}
            </Text>
          ) : (
            <Text key={i} style={{ color }}>{seg.text}</Text>
          ),
        )}
      </Text>

      <Modal visible={selectedPhone !== null} transparent animationType="fade" onRequestClose={() => setSelectedPhone(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelectedPhone(null)}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>الرقم المكتشف</Text>
              <TouchableOpacity onPress={() => setSelectedPhone(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <X size={20} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.phoneNumber, { color: colors.info }]}>{selectedPhone}</Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                onPress={handleCopy}
                style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                {copied ? <Check size={20} color={colors.success} strokeWidth={2} /> : <Copy size={20} color={colors.primary} strokeWidth={2} />}
                <Text style={[styles.actionLabel, { color: colors.text }]}>{copied ? 'تم النسخ' : 'نسخ'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCall}
                style={[styles.actionBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
                activeOpacity={0.7}
              >
                <Phone size={20} color={colors.primary} strokeWidth={2} />
                <Text style={[styles.actionLabel, { color: colors.primary }]}>اتصال</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSms}
                style={[styles.actionBtn, { backgroundColor: colors.info + '15', borderColor: colors.info + '30' }]}
                activeOpacity={0.7}
              >
                <MessageSquare size={20} color={colors.info} strokeWidth={2} />
                <Text style={[styles.actionLabel, { color: colors.info }]}>رسالة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export const PhoneNumberText = memo(PhoneNumberTextInner);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: 'Cairo-SemiBold',
  },
  phoneNumber: {
    fontSize: 22,
    fontFamily: 'Cairo-Bold',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: 'Cairo-SemiBold',
  },
});
