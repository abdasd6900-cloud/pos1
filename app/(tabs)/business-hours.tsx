import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, Switch, Alert, Platform, Linking, Modal , PermissionsAndroid } from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import {
  Clock, MessageSquare, Phone, Moon, Settings as SettingsIcon,
  Plus, Trash2, Save, Check, Calendar, AlertCircle, Info,
 ChevronDown, ChevronUp } from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import type { BusinessHoursConfig, WeekDay, KeywordReply, SubAgent, BusinessDaySchedule } from '@/types';
import { WEEK_DAYS, WEEK_DAY_NAMES, isStoreOpen, getNextOpenTime, isAgentOpen, getNextAgentOpenTime, createDefaultSchedule, parseTimeString } from '@/lib/business-hours';
import { setDoNotDisturb, setSmsGatewayEnabled, isCallScreeningRoleHeld, requestCallScreeningRole, isCallScreeningSupported } from '@/lib/native-bridge';

export default function BusinessHoursScreen() {
  const { settings, businessHours, updateSettings, updateBusinessHours, keywordReplies, addKeywordReply, updateKeywordReply, deleteKeywordReply, subAgents, updateSubAgent } = useApp();
  const { colors } = useTheme();

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<KeywordReply | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [activePicker, setActivePicker] = useState<{ day: WeekDay; field: 'openTime' | 'closeTime'; agentId?: string } | null>(null);
  const [callScreeningHeld, setCallScreeningHeld] = useState(false);
  const [callScreeningLoading, setCallScreeningLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    isCallScreeningRoleHeld().then(setCallScreeningHeld);
  }, []);

  const storeOpen = useMemo(
    () => !settings.enableBusinessHours || isStoreOpen(businessHours, now),
    [businessHours, now, settings.enableBusinessHours],
  );
  const nextOpen = useMemo(() => getNextOpenTime(businessHours, now), [businessHours, now]);

  // Auto-toggle DND based on store open/closed state
  useEffect(() => {
    if (!businessHours.enableDnd || Platform.OS === 'web') return;
    void setDoNotDisturb(!storeOpen);
  }, [businessHours.enableDnd, storeOpen]);

  const updateDay = (day: WeekDay, field: 'enabled' | 'openTime' | 'closeTime', value: boolean | string) => {
    const newDays = { ...businessHours.days, [day]: { ...businessHours.days[day], [field]: value } };
    updateBusinessHours({ days: newDays });
  };

  const openTimePicker = (day: WeekDay, field: 'openTime' | 'closeTime', agentId?: string) => {
    setActivePicker({ day, field, agentId });
  };

  const closeTimePicker = () => setActivePicker(null);

  const getPickerTime = (): string => {
    if (!activePicker) return '09:00';
    if (activePicker.agentId) {
      return subAgents.find((agent) => agent.id === activePicker.agentId)?.schedule[activePicker.day][activePicker.field] ?? '09:00';
    }
    return businessHours.days[activePicker.day][activePicker.field];
  };

  const updatePickerTime = (value: string) => {
    if (!activePicker) return;
    if (activePicker.agentId) {
      const agent = subAgents.find((item) => item.id === activePicker.agentId);
      if (!agent) return;
      const schedule = { ...agent.schedule, [activePicker.day]: { ...agent.schedule[activePicker.day], [activePicker.field]: value } };
      updateSubAgent(agent.id, { schedule });
      return;
    }
    updateDay(activePicker.day, activePicker.field, value);
  };

  const handleSaveKeyword = () => {
    const keywords = keywordInput.split(',').map((k) => k.trim()).filter(Boolean);
    if (keywords.length === 0 || !replyInput.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال كلمات مفتاحية ورد');
      return;
    }
    if (editingKeyword) {
      updateKeywordReply(editingKeyword.id, { keywords, reply: replyInput.trim() });
    } else {
      addKeywordReply({ keywords, reply: replyInput.trim(), active: true });
    }
    setShowKeywordModal(false);
    setEditingKeyword(null);
    setKeywordInput('');
    setReplyInput('');
  };

  const openEditKeyword = (r: KeywordReply) => {
    setEditingKeyword(r);
    setKeywordInput(r.keywords.join(', '));
    setReplyInput(r.reply);
    setShowKeywordModal(true);
  };

  const openAddKeyword = () => {
    setEditingKeyword(null);
    setKeywordInput('');
    setReplyInput('');
    setShowKeywordModal(true);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      {/* Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: storeOpen ? colors.success + '15' : colors.danger + '15' }]}>
        <View style={[styles.statusIcon, { backgroundColor: storeOpen ? colors.success + '25' : colors.danger + '25' }]}>
          {storeOpen ? <Check size={22} color={colors.success} strokeWidth={2} /> : <Moon size={22} color={colors.danger} strokeWidth={2} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusTitle, { color: storeOpen ? colors.success : colors.danger }]}>
            {storeOpen ? 'المحل مفتوح الآن' : 'المحل مغلق الآن'}
          </Text>
          {!storeOpen && nextOpen && (
            <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
              يفتح {WEEK_DAY_NAMES[nextOpen.day]} الساعة {nextOpen.openTime}
            </Text>
          )}
        </View>
      </View>

      {/* Feature Toggle */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>تفعيل الميزة</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Calendar size={20} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.toggleLabel, { color: colors.text }]}>جدولة أوقات العمل</Text>
          </View>
          <Switch
            value={settings.enableBusinessHours}
            onValueChange={(v) => {
              updateSettings({ enableBusinessHours: v });
              updateBusinessHours({ autoMode: v });
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </View>

      {/* Weekly Schedule */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>جدول الأسبوع</Text>
        {WEEK_DAYS.map((day) => {
          const schedule = businessHours.days[day];
          return (
            <View key={day} style={[styles.dayRow, { borderBottomColor: colors.border }]}>
              <View style={styles.dayLeft}>
                <Switch
                  value={schedule.enabled}
                  onValueChange={(v) => updateDay(day, 'enabled', v)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  style={styles.daySwitch}
                />
                <Text style={[styles.dayName, { color: schedule.enabled ? colors.text : colors.textMuted }]}>
                  {WEEK_DAY_NAMES[day]}
                </Text>
              </View>
              {schedule.enabled ? (
                <View style={styles.timeInputs}>
                  <TouchableOpacity
                    style={[styles.timeInput, { backgroundColor: colors.surfaceAlt }]}
                    onPress={() => openTimePicker(day, 'openTime')}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.timeInputText, { color: colors.text }]}>{schedule.openTime}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.timeDash, { color: colors.textMuted }]}>—</Text>
                  <TouchableOpacity
                    style={[styles.timeInput, { backgroundColor: colors.surfaceAlt }]}
                    onPress={() => openTimePicker(day, 'closeTime')}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.timeInputText, { color: colors.text }]}>{schedule.closeTime}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.closedLabel, { color: colors.textMuted }]}>مغلق</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Agent Schedules */}
      {subAgents.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>مواعيد الوكلاء اليومية</Text>
          <Text style={[styles.inputHint, { color: colors.textMuted, marginBottom: 12 }] }>
            عند تفعيل المواعيد، إذا ورد طلب زبون خارج وقت دوام الوكيل يتم إبقاؤه معلقاً حتى بدء الدوام مع إشعار الزبون بأن الشركة مغلقة
          </Text>
          {subAgents.map((agent) => {
            const isOpen = isAgentOpen(agent);
            const nextOpen = getNextAgentOpenTime(agent);
            const isExpanded = expandedAgent === agent.id;
            const updateAgentDay = (day: WeekDay, field: 'enabled' | 'openTime' | 'closeTime', value: boolean | string) => {
              const newSchedule = { ...agent.schedule, [day]: { ...agent.schedule[day], [field]: value } };
              updateSubAgent(agent.id, { schedule: newSchedule });
            };
            return (
              <View key={agent.id} style={[styles.agentCard, { backgroundColor: colors.surfaceAlt }]}>
                <View style={styles.agentCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.agentNameRow}>
                      <Text style={[styles.agentName, { color: colors.text }]}>{agent.name}</Text>
                      <View style={[styles.agentStatusBadge, { backgroundColor: isOpen ? colors.success + '20' : colors.danger + '20' }]}>
                        <Text style={[styles.agentStatusText, { color: isOpen ? colors.success : colors.danger }]}>
                          {isOpen ? 'مفتوح' : 'مغلق'}
                        </Text>
                      </View>
                    </View>
                    {!isOpen && nextOpen && (
                      <Text style={[styles.agentNextOpen, { color: colors.textMuted }]}>
                        يفتح {WEEK_DAY_NAMES[nextOpen.day]} الساعة {nextOpen.openTime}
                      </Text>
                    )}
                  </View>
                  <Switch
                    value={agent.scheduleEnabled}
                    onValueChange={(v) => updateSubAgent(agent.id, { scheduleEnabled: v })}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    style={styles.daySwitch}
                  />
                  <TouchableOpacity onPress={() => setExpandedAgent(isExpanded ? null : agent.id)} style={styles.expandBtn}>
                    {isExpanded
                      ? <ChevronUp size={20} color={colors.textSecondary} strokeWidth={2} />
                      : <ChevronDown size={20} color={colors.textSecondary} strokeWidth={2} />}
                  </TouchableOpacity>
                </View>
                {isExpanded && agent.scheduleEnabled && (
                  <View style={styles.agentScheduleContainer}>
                    {WEEK_DAYS.map((day) => {
                      const daySchedule = agent.schedule[day];
                      return (
                        <View key={day} style={[styles.dayRow, { borderBottomColor: colors.border }]}>
                          <View style={styles.dayLeft}>
                            <Switch
                              value={daySchedule.enabled}
                              onValueChange={(v) => updateAgentDay(day, 'enabled', v)}
                              trackColor={{ false: colors.border, true: colors.primary }}
                              style={styles.daySwitch}
                            />
                            <Text style={[styles.dayName, { color: daySchedule.enabled ? colors.text : colors.textMuted }]}>
                              {WEEK_DAY_NAMES[day]}
                            </Text>
                          </View>
                          {daySchedule.enabled ? (
                            <View style={styles.timeInputs}>
                              <TouchableOpacity
                                style={[styles.timeInput, { backgroundColor: colors.surface }]}
                                onPress={() => openTimePicker(day, 'openTime', agent.id)}
                                activeOpacity={0.75}
                              >
                                <Text style={[styles.timeInputText, { color: colors.text }]}>{daySchedule.openTime}</Text>
                              </TouchableOpacity>
                              <Text style={[styles.timeDash, { color: colors.textMuted }]}>—</Text>
                              <TouchableOpacity
                                style={[styles.timeInput, { backgroundColor: colors.surface }]}
                                onPress={() => openTimePicker(day, 'closeTime', agent.id)}
                                activeOpacity={0.75}
                              >
                                <Text style={[styles.timeInputText, { color: colors.text }]}>{daySchedule.closeTime}</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <Text style={[styles.closedLabel, { color: colors.textMuted }]}>مغلق</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Auto-Response Settings */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>إعدادات الرد التلقائي</Text>

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Moon size={20} color={colors.primary} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>وضع عدم الإزعاج عند الإغلاق</Text>
              {businessHours.enableDnd && (
                <Text style={[styles.inputHint, { color: storeOpen ? colors.textMuted : colors.danger, marginTop: 2 }]}>
                  {storeOpen ? 'سيتفعل تلقائياً عند إغلاق المحل' : 'مفعّل الآن — المحل مغلق'}
                </Text>
              )}
            </View>
          </View>
          <Switch value={businessHours.enableDnd} onValueChange={async (v) => {
            updateBusinessHours({ enableDnd: v });
            if (v && Platform.OS !== 'web') {
              const result = await setDoNotDisturb(!storeOpen);
              if (!result.success && !storeOpen) {
                Alert.alert(
                  'تنبيه',
                  result.error || 'تعذر تفعيل وضع عدم الإزعاج. يجب منح الإذن من إعدادات الجهاز',
                  [
                    { text: 'إلغاء', style: 'cancel' },
                    { text: 'فتح الإعدادات', onPress: () => Linking.openSettings() },
                  ]
                );
              }
            } else if (!v && Platform.OS !== 'web') {
              await setDoNotDisturb(false);
            }
          }} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <MessageSquare size={20} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.toggleLabel, { color: colors.text }]}>رد تلقائي على الرسائل</Text>
          </View>
          <Switch value={businessHours.enableAutoReply} onValueChange={(v) => updateBusinessHours({ enableAutoReply: v })} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Phone size={20} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.toggleLabel, { color: colors.text }]}>رفض المكالمات وإرسال رسالة</Text>
          </View>
          <Switch value={businessHours.enableCallRejection} onValueChange={(v) => updateBusinessHours({ enableCallRejection: v })} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>

        {businessHours.enableCallRejection && Platform.OS === 'android' && (
          <View style={[styles.warningBanner, { backgroundColor: callScreeningHeld ? colors.success + '15' : colors.warning + '15', borderColor: callScreeningHeld ? colors.success + '40' : colors.warning + '40', marginTop: 10 }]}>
            {callScreeningHeld ? (
              <>
                <Check size={18} color={colors.success} strokeWidth={2} />
                <Text style={[styles.warningText, { color: colors.success, flex: 1 }]}>
                  دور فحص المكالمات مفعّل. سيتم رفض المكالمات تلقائياً خارج وقت العمل وإرسال رسالة للمتصل
                </Text>
              </>
            ) : (
              <>
                <AlertCircle size={18} color={colors.warning} strokeWidth={2} />
                <Text style={[styles.warningText, { color: colors.warning, flex: 1 }]}>
                  لرفض المكالمات بشكل موثوق، يجب منح دور &quot;فاحص المكالمات&quot; من إعدادات النظام
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    if (callScreeningLoading) return;
                    setCallScreeningLoading(true);
                    const granted = await requestCallScreeningRole();
                    setCallScreeningHeld(granted);
                    setCallScreeningLoading(false);
                    if (!granted) {
                      Alert.alert('تنبيه', 'لم يتم منح الدور. يمكنك المحاولة مرة أخرى أو تفعيله من إعدادات الجهاز');
                    }
                  }}
                  style={[styles.addBtn, { backgroundColor: colors.warning, marginLeft: 8 }]}
                  disabled={callScreeningLoading}
                >
                  <Text style={styles.addBtnText}>تفعيل</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {businessHours.enableCallRejection && Platform.OS === 'android' && !isCallScreeningSupported() && (
          <View style={[styles.warningBanner, { backgroundColor: colors.surfaceAlt, marginTop: 8 }]}>
            <Info size={18} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.warningText, { color: colors.textMuted }]}>
              دور فاحص المكالمات غير مدعوم على هذا الإصدار من أندرويد (يتطلب Android 10 أو أحدث)
            </Text>
          </View>
        )}

        <View style={[styles.inputGroup, { borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>رسالة عند فتح المحل</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
            value={businessHours.openMessage}
            onChangeText={(v) => updateBusinessHours({ openMessage: v })}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={[styles.inputGroup, { borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>رسالة عند إغلاق المحل</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
            value={businessHours.closedMessage}
            onChangeText={(v) => updateBusinessHours({ closedMessage: v })}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={[styles.inputGroup, { borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>فترة عدم تكرار الرد (بالدقائق)</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
            value={String(businessHours.autoReplyCooldownMinutes)}
            onChangeText={(v) => updateBusinessHours({ autoReplyCooldownMinutes: parseInt(v, 10) || 0 })}
            keyboardType="numeric"
          />
          <Text style={[styles.inputHint, { color: colors.textMuted }]}>يتم إرسال رسالة واحدة فقط لكل شخص خلال هذه الفترة حتى لو أرسل عدة رسائل أو اتصل أكثر من مرة</Text>
        </View>
      </View>

      {/* Monitoring Toggles */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>مراقبة الرسائل</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <MessageSquare size={20} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.toggleLabel, { color: colors.text }]}>مراقبة رسائل SMS</Text>
          </View>
          <Switch value={settings.enableSmsMonitoring} onValueChange={async (v) => {
            if (v && Platform.OS === 'android') {
              try {
                const perms = await PermissionsAndroid.requestMultiple([
                  PermissionsAndroid.PERMISSIONS.SEND_SMS,
                  PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
                  PermissionsAndroid.PERMISSIONS.READ_SMS,
                ]);
                const allGranted = Object.values(perms).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
                if (!allGranted) {
                  Alert.alert('تنبيه', 'يجب منح أذونات SMS من إعدادات الجهاز ليعمل المراقبة والرد التلقائي');
                  return;
                }
              } catch {
                Alert.alert('تنبيه', 'تعذر طلب أذونات SMS');
                return;
              }
            }
            updateSettings({ enableSmsMonitoring: v });
            setSmsGatewayEnabled(v);
          }} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <MessageSquare size={20} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.toggleLabel, { color: colors.text }]}>مراقبة رسائل الواتساب</Text>
          </View>
          <Switch value={settings.enableWhatsappMonitoring} onValueChange={(v) => updateSettings({ enableWhatsappMonitoring: v })} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>
        {settings.enableWhatsappMonitoring && Platform.OS === 'android' && (
          <TouchableOpacity
            onPress={() => Linking.openSettings()}
            style={[styles.warningBanner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}
            activeOpacity={0.7}
          >
            <AlertCircle size={18} color={colors.warning} strokeWidth={2} />
            <Text style={[styles.warningText, { color: colors.warning }]}>
              لمراقبة واتساب، فعّل &quot;الوصول للإشعارات&quot; من إعدادات الجهاز ثم اختر سحاب POS من قائمة خدمات الإشعارات. اضغط هنا لفتح الإعدادات
            </Text>
          </TouchableOpacity>
        )}
        {settings.enableWhatsappMonitoring && Platform.OS === 'web' && (
          <View style={[styles.warningBanner, { backgroundColor: colors.surfaceAlt }]}>
            <Info size={18} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.warningText, { color: colors.textMuted }]}>
              مراقبة واتساب تعمل فقط من جهاز الأندرويد
            </Text>
          </View>
        )}
        <Text style={[styles.inputHint, { color: colors.textMuted, marginTop: 8 }]}>
          عند تفعيل المراقبة، يتم البحث في الرسائل عن أرقام شرائح واستيرادها كعمليات بانتظار التنفيذ
        </Text>
        {settings.enableSmsMonitoring && Platform.OS === 'android' && (
          <View style={[styles.warningBanner, { backgroundColor: colors.success + '15', borderColor: colors.success + '40', marginTop: 10 }]}>
            <Check size={18} color={colors.success} strokeWidth={2} />
            <Text style={[styles.warningText, { color: colors.success }]}>
              مراقبة الرسائل مفعّلة. سيتم قراءة الرسائل الواردة وردّها تلقائياً حسب الإعدادات
            </Text>
          </View>
        )}
        {settings.enableSmsMonitoring && Platform.OS === 'web' && (
          <View style={[styles.warningBanner, { backgroundColor: colors.surfaceAlt }]}>
            <Info size={18} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.warningText, { color: colors.textMuted }]}>
              مراقبة الرسائل تعمل فقط من جهاز الأندرويد
            </Text>
          </View>
        )}
      </View>

      {/* Keyword Replies */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>الردود بالكلمات المفتاحية</Text>
          <TouchableOpacity onPress={openAddKeyword} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <Plus size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.addBtnText}>إضافة</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.inputHint, { color: colors.textMuted, marginBottom: 12 }]}>
          عند وصول رسالة تحتوي على كلمة مفتاحية، يتم الرد بالرد المخصص لها بدلاً من الرد العام
        </Text>
        {keywordReplies.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد ردود مفتاحية بعد</Text>
        ) : (
          keywordReplies.map((r) => (
            <View key={r.id} style={[styles.keywordCard, { backgroundColor: colors.surfaceAlt }]}>
              <View style={styles.keywordCardTop}>
                <View style={styles.keywordTags}>
                  {r.keywords.map((kw, i) => (
                    <View key={i} style={[styles.keywordTag, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.keywordTagText, { color: colors.primary }]}>{kw}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.keywordActions}>
                  <Switch
                    value={r.active}
                    onValueChange={(v) => updateKeywordReply(r.id, { active: v })}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    style={styles.keywordSwitch}
                  />
                  <TouchableOpacity onPress={() => openEditKeyword(r)} style={styles.keywordEditBtn}>
                    <SettingsIcon size={16} color={colors.textSecondary} strokeWidth={2} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteKeywordReply(r.id)} style={styles.keywordEditBtn}>
                    <Trash2 size={16} color={colors.danger} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.keywordReply, { color: colors.text }]}>{r.reply}</Text>
            </View>
          ))
        )}
      </View>

      {/* Keyword Modal */}
      {showKeywordModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingKeyword ? 'تعديل رد مفتاحي' : 'إضافة رد مفتاحي'}
            </Text>
            <View style={styles.modalField}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>الكلمات المفتاحية (افصل بفاصلة)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
                value={keywordInput}
                onChangeText={setKeywordInput}
                placeholder="شحن, تفعيل, تجديد"
              />
            </View>
            <View style={styles.modalField}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>الرد</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.surfaceAlt, color: colors.text }]}
                value={replyInput}
                onChangeText={setReplyInput}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => { setShowKeywordModal(false); setEditingKeyword(null); }}
                style={[styles.modalCancel, { backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveKeyword}
                style={[styles.modalSave, { backgroundColor: colors.primary }]}
              >
                <Save size={18} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.modalSaveText}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ClockTimePicker
        visible={activePicker !== null}
        currentTime={getPickerTime()}
        colors={colors}
        onChange={updatePickerTime}
        onClose={closeTimePicker}
      />
    </ScrollView>
  );
}

function ClockTimePicker({
  visible,
  currentTime,
  colors,
  onChange,
  onClose,
}: {
  visible: boolean;
  currentTime: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'am' | 'pm'>('am');

  useEffect(() => {
    if (!visible) return;
    const parsed = parseTimeString(currentTime);
    setHour(parsed.hours % 24);
    setMinute(parsed.minutes - (parsed.minutes % 5));
    setPeriod(parsed.hours >= 12 ? 'pm' : 'am');
    setMode('hour');
  }, [currentTime, visible]);

  const displayHour = hour % 12 || 12;
  const hours = Array.from({ length: 12 }, (_, index) => index + 1);
  const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
  const selectHour = (value: number) => {
    const nextHour = value === 12 ? (period === 'pm' ? 12 : 0) : value + (period === 'pm' ? 12 : 0);
    setHour(nextHour);
    setMode('minute');
  };
  const selectPeriod = (nextPeriod: 'am' | 'pm') => {
    const visibleHour = hour % 12 || 12;
    setPeriod(nextPeriod);
    setHour(visibleHour === 12 ? (nextPeriod === 'pm' ? 12 : 0) : visibleHour + (nextPeriod === 'pm' ? 12 : 0));
  };
  const selectMinute = (value: number) => {
    setMinute(value);
    onChange(`${String(hour).padStart(2, '0')}:${String(value).padStart(2, '0')}`);
    onClose();
  };
  const placeNumber = (index: number, total: number) => {
    const angle = (index * 2 * Math.PI) / total;
    return {
      left: 110 + 92 * Math.sin(angle) - 20,
      top: 110 - 92 * Math.cos(angle) - 20,
    };
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerOverlay}>
        <View style={[styles.pickerCard, { backgroundColor: colors.surface }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>اختيار الوقت</Text>
            <TouchableOpacity onPress={onClose} style={styles.pickerClose}>
              <Text style={[styles.pickerCloseText, { color: colors.textMuted }]}>إلغاء</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.pickerTimePreview}>
            <Text style={[styles.pickerTimeValue, { color: colors.primary }]}>
              {String(displayHour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
            </Text>
            <View style={styles.periodToggle}>
              <TouchableOpacity
                onPress={() => selectPeriod('am')}
                style={[styles.periodButton, { backgroundColor: period === 'am' ? colors.primary : colors.surfaceAlt }]}
              >
                <Text style={[styles.periodText, { color: period === 'am' ? '#FFFFFF' : colors.textMuted }]}>صباحاً</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => selectPeriod('pm')}
                style={[styles.periodButton, { backgroundColor: period === 'pm' ? colors.primary : colors.surfaceAlt }]}
              >
                <Text style={[styles.periodText, { color: period === 'pm' ? '#FFFFFF' : colors.textMuted }]}>مساءً</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.pickerHint, { color: colors.textMuted }]}>{mode === 'hour' ? 'اختر الساعة' : 'اختر الدقائق'}</Text>
          </View>
          <View style={[styles.clockFace, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            {(mode === 'hour' ? hours : minutes).map((value, index) => {
              const selected = mode === 'hour' ? displayHour === value : minute === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => mode === 'hour' ? selectHour(value) : selectMinute(value)}
                  style={[styles.clockNumber, placeNumber(index, 12), selected && { backgroundColor: colors.primary }]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.clockNumberText, { color: selected ? '#FFFFFF' : colors.text }]}>
                    {String(value).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={[styles.clockCenter, { backgroundColor: colors.primary }]} />
          </View>
          {mode === 'minute' && (
            <TouchableOpacity onPress={() => setMode('hour')} style={styles.changeHourButton}>
              <Text style={[styles.changeHourText, { color: colors.primary }]}>العودة لاختيار الساعة</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, marginBottom: 16 },
  statusIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  statusSub: { fontSize: 14, marginTop: 4, fontFamily: 'Cairo-Regular' },
  section: { borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  toggleInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  toggleLabel: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  dayLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  daySwitch: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  dayName: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  timeInputs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { width: 64, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  timeInputText: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  timeDash: { fontSize: 16 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  pickerCard: { width: '100%', maxWidth: 360, borderRadius: 22, padding: 20, alignItems: 'center' },
  pickerHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  pickerTitle: { fontSize: 18, fontFamily: 'Cairo-Bold' },
  pickerClose: { padding: 6 },
  pickerCloseText: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  pickerTimePreview: { alignItems: 'center', marginBottom: 14 },
  pickerTimeValue: { fontSize: 30, fontFamily: 'Cairo-Bold', letterSpacing: 1 },
  periodToggle: { flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 4 },
  periodButton: { minWidth: 68, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center' },
  periodText: { fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  pickerHint: { fontSize: 12, fontFamily: 'Cairo-Regular', marginTop: 2 },
  clockFace: { width: 260, height: 260, borderRadius: 130, borderWidth: 1, position: 'relative' },
  clockNumber: { position: 'absolute', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  clockNumberText: { fontSize: 14, fontFamily: 'Cairo-SemiBold' },
  clockCenter: { position: 'absolute', width: 8, height: 8, borderRadius: 4, left: 126, top: 126 },
  changeHourButton: { paddingVertical: 10, paddingHorizontal: 8 },
  changeHourText: { fontSize: 13, fontFamily: 'Cairo-SemiBold' },
  closedLabel: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  inputGroup: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  inputLabel: { fontSize: 14, fontFamily: 'Cairo-SemiBold', marginBottom: 8 },
  inputHint: { fontSize: 12, fontFamily: 'Cairo-Regular', marginTop: 6, lineHeight: 18 },
  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginTop: 10, borderWidth: 1 },
  warningText: { fontSize: 13, fontFamily: 'Cairo-Regular', lineHeight: 18, flex: 1 },
  textArea: { borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'Cairo-Regular', minHeight: 72 },
  textInput: { borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'Cairo-Regular', height: 44 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Cairo-SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Cairo-Regular', textAlign: 'center', paddingVertical: 16 },
  keywordCard: { borderRadius: 12, padding: 12, marginBottom: 10 },
  keywordCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  keywordTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  keywordTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  keywordTagText: { fontSize: 13, fontFamily: 'Cairo-SemiBold' },
  keywordActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keywordSwitch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
  keywordEditBtn: { padding: 4 },
  keywordReply: { fontSize: 14, fontFamily: 'Cairo-Regular', lineHeight: 22 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalSheet: { width: '90%', maxWidth: 440, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 16 },
  modalField: { marginBottom: 14 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  modalSave: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  modalSaveText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  agentCard: { borderRadius: 12, padding: 12, marginBottom: 10 },
  agentCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agentName: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  agentStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  agentStatusText: { fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  agentNextOpen: { fontSize: 12, fontFamily: 'Cairo-Regular', marginTop: 4 },
  expandBtn: { padding: 4 },
  agentScheduleContainer: { marginTop: 10 },
});
