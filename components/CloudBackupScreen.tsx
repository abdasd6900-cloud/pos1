import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, TextInput, Modal,
} from 'react-native';
import { Cloud, Download, Trash2, Upload, Clock, Check, AlertCircle, ChevronLeft } from 'lucide-react-native';
import { BaseModal } from './BaseModal';
import { useApp } from '@/lib/app-context';
import type { CloudSnapshot } from '@/lib/cloud-backup';
import { useTheme } from '@/lib/theme-context';

interface CloudBackupScreenProps {
  visible: boolean;
  onClose: () => void;
}

export function CloudBackupScreen({ visible, onClose }: CloudBackupScreenProps) {
  const { uploadCloudBackup, listCloudBackups, restoreCloudBackup, deleteCloudBackup } = useApp();
  const { colors } = useTheme();
  const [snapshots, setSnapshots] = useState<CloudSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelText, setLabelText] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<CloudSnapshot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CloudSnapshot | null>(null);

  const fetchSnapshots = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const { data, error } = await listCloudBackups();
    if (isRefresh) setRefreshing(false);
    else setLoading(false);
    if (error) {
      setMessage({ text: `تعذر تحميل النسخ: ${error}`, type: 'error' });
      return;
    }
    setSnapshots(data || []);
  }, [listCloudBackups]);

  useEffect(() => {
    if (visible) {
      setMessage(null);
      void fetchSnapshots();
    }
  }, [visible, fetchSnapshots]);

  const handleUpload = async () => {
    const label = labelText.trim() || `نسخة ${new Date().toLocaleDateString('ar')}`;
    setShowLabelModal(false);
    setLabelText('');
    setUploading(true);
    setMessage(null);
    const result = await uploadCloudBackup(label);
    setUploading(false);
    if (result.success) {
      setMessage({ text: 'تم رفع النسخة بنجاح', type: 'success' });
      void fetchSnapshots();
    } else {
      setMessage({ text: `تعذر الرفع: ${result.error}`, type: 'error' });
    }
  };

  const handleRestore = async (snap: CloudSnapshot) => {
    setConfirmRestore(null);
    setRestoringId(snap.id);
    setMessage(null);
    const result = await restoreCloudBackup(snap.id);
    setRestoringId(null);
    if (result.success) {
      setMessage({ text: 'تم استعادة النسخة بنجاح', type: 'success' });
    } else {
      setMessage({ text: `تعذر الاستعادة: ${result.error}`, type: 'error' });
    }
  };

  const handleDelete = async (snap: CloudSnapshot) => {
    setConfirmDelete(null);
    setDeletingId(snap.id);
    const result = await deleteCloudBackup(snap.id);
    setDeletingId(null);
    if (result.success) {
      setMessage({ text: 'تم حذف النسخة', type: 'success' });
      void fetchSnapshots();
    } else {
      setMessage({ text: `تعذر الحذف: ${result.error}`, type: 'error' });
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderItem = ({ item }: { item: CloudSnapshot }) => (
    <View style={[styles.snapshotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.snapshotInfo}>
        <View style={[styles.snapshotIcon, { backgroundColor: colors.primary + '15' }]}>
          <Cloud size={18} color={colors.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.snapshotLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
          <View style={styles.snapshotMeta}>
            <Clock size={12} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.snapshotDate, { color: colors.textMuted }]}>{formatDate(item.created_at)}</Text>
            <Text style={[styles.snapshotSize, { color: colors.textMuted }]}>{formatSize(item.data_size)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.snapshotActions}>
        <TouchableOpacity
          onPress={() => setConfirmRestore(item)}
          disabled={restoringId === item.id}
          style={[styles.actionBtn, { backgroundColor: colors.accent + '15' }]}
        >
          {restoringId === item.id ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Download size={16} color={colors.accent} strokeWidth={2} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setConfirmDelete(item)}
          disabled={deletingId === item.id}
          style={[styles.actionBtn, { backgroundColor: colors.danger + '15' }]}
        >
          {deletingId === item.id ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Trash2 size={16} color={colors.danger} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="النسخ السحابية"
      footer={
        <TouchableOpacity
          onPress={() => { setLabelText(''); setShowLabelModal(true); }}
          disabled={uploading}
          style={[styles.uploadBtn, { backgroundColor: colors.primary, opacity: uploading ? 0.6 : 1 }]}
          activeOpacity={0.8}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Upload size={18} color="#FFFFFF" strokeWidth={2} />
          )}
          <Text style={styles.uploadBtnText}>{uploading ? 'جاري الرفع...' : 'رفع نسخة جديدة'}</Text>
        </TouchableOpacity>
      }
    >
      {message && (
        <View style={[styles.messageBar, { backgroundColor: message.type === 'success' ? colors.success + '15' : colors.danger + '15' }]}>
          {message.type === 'success' ? (
            <Check size={16} color={colors.success} strokeWidth={2} />
          ) : (
            <AlertCircle size={16} color={colors.danger} strokeWidth={2} />
          )}
          <Text style={[styles.messageText, { color: message.type === 'success' ? colors.success : colors.danger }]}>
            {message.text}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: 12 }]}>جاري تحميل النسخ...</Text>
        </View>
      ) : snapshots.length === 0 ? (
        <View style={styles.centerState}>
          <Cloud size={48} color={colors.textMuted} strokeWidth={1.5} />
          <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: 12 }]}>لا توجد نسخ سحابية بعد</Text>
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>اضغط "رفع نسخة جديدة" لحفظ بياناتك في السحابة</Text>
        </View>
      ) : (
        <FlatList
          data={snapshots}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchSnapshots(true)} colors={[colors.primary]} />
          }
          contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Label Modal */}
      <Modal visible={showLabelModal} transparent animationType="fade" onRequestClose={() => setShowLabelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.labelModal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.labelModalTitle, { color: colors.text }]}>تسمية النسخة</Text>
            <TextInput
              value={labelText}
              onChangeText={setLabelText}
              placeholder="مثال: نسخة قبل التعديل"
              placeholderTextColor={colors.textMuted}
              style={[styles.labelInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
              autoFocus
            />
            <View style={styles.labelModalActions}>
              <TouchableOpacity onPress={() => setShowLabelModal(false)} style={[styles.labelBtn, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.labelBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUpload} style={[styles.labelBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.labelBtnTextWhite}>رفع</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Restore Confirm */}
      <Modal visible={confirmRestore !== null} transparent animationType="fade" onRequestClose={() => setConfirmRestore(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, { backgroundColor: colors.surface }]}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.accent + '15' }]}>
              <Download size={28} color={colors.accent} strokeWidth={2} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>استعادة النسخة</Text>
            <Text style={[styles.confirmMsg, { color: colors.textSecondary }]}>
              سيتم استبدال جميع البيانات الحالية بنسخة "{confirmRestore?.label}". لا يمكن التراجع.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity onPress={() => setConfirmRestore(null)} style={[styles.confirmBtn, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.confirmBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmRestore && handleRestore(confirmRestore)} style={[styles.confirmBtn, { backgroundColor: colors.accent }]}>
                <Text style={styles.confirmBtnTextWhite}>استعادة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirm */}
      <Modal visible={confirmDelete !== null} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, { backgroundColor: colors.surface }]}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.danger + '15' }]}>
              <Trash2 size={28} color={colors.danger} strokeWidth={2} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>حذف النسخة</Text>
            <Text style={[styles.confirmMsg, { color: colors.textSecondary }]}>
              سيتم حذف نسخة "{confirmDelete?.label}" نهائياً.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity onPress={() => setConfirmDelete(null)} style={[styles.confirmBtn, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.confirmBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete && handleDelete(confirmDelete)} style={[styles.confirmBtn, { backgroundColor: colors.danger }]}>
                <Text style={styles.confirmBtnTextWhite}>حذف</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  snapshotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  snapshotInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  snapshotIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  snapshotMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  snapshotDate: {
    fontSize: 11,
  },
  snapshotSize: {
    fontSize: 11,
    fontWeight: '500',
  },
  snapshotActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  messageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  messageText: {
    fontSize: 13,
    flex: 1,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  labelModal: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  labelModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  labelInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  labelModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  labelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  labelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  labelBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmModal: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  confirmMsg: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
