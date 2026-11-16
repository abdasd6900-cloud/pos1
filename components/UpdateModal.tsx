import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Download, X, AlertCircle } from 'lucide-react-native';
import type { AppUpdateInfo } from '@/lib/use-update-notification';
import type { Palette } from '@/lib/color-system';

interface UpdateModalProps {
  update: AppUpdateInfo | null;
  onApply: () => void;
  onDismiss: () => void;
  colors: Palette;
}

export function UpdateModal({ update, onApply, onDismiss, colors }: UpdateModalProps) {
  if (!update) return null;

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!update.force_install) onDismiss();
      }}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + '15' }]}>
            <Download size={32} color={colors.primary} strokeWidth={2} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            {update.title}
          </Text>

          <Text style={[styles.version, { color: colors.textMuted }]}>
            الإصدار {update.version}
          </Text>

          {update.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {update.description}
            </Text>
          ) : null}

          {update.force_install ? (
            <View style={[styles.notice, { backgroundColor: colors.warning + '15' }]}>
              <AlertCircle size={16} color={colors.warning} strokeWidth={2} />
              <Text style={[styles.noticeText, { color: colors.warning }]}>
                هذا تحديث إلزامي — يجب تحديث التطبيق للمتابعة
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onApply}
              style={[styles.applyBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Download size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.applyText}>تحديث الآن</Text>
            </TouchableOpacity>

            {!update.force_install ? (
              <TouchableOpacity
                onPress={onDismiss}
                style={[styles.skipBtn, { borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.skipText, { color: colors.textMuted }]}>لاحقاً</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Cairo-Bold',
    textAlign: 'center',
  },
  version: {
    fontSize: 13,
    fontFamily: 'Cairo-Regular',
    marginTop: 4,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Cairo-Regular',
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
    width: '100%',
  },
  noticeText: {
    fontSize: 12,
    fontFamily: 'Cairo-SemiBold',
    flex: 1,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  applyText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Cairo-SemiBold',
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Cairo-Regular',
  },
});
