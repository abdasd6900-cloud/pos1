import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useState, useRef } from 'react';
import { PanGestureHandler, PanGestureHandlerGestureEvent, PanGestureHandlerStateChangeEvent, State } from 'react-native-gesture-handler';
import { Check, X, RotateCcw, PenTool } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';

type Colors = ReturnType<typeof useTheme>['colors'];

interface Point {
  x: number;
  y: number;
}

export function SignaturePad({ visible, onClose, onSave, colors, title }: {
  visible: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  colors: Colors;
  title?: string;
}) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const currentStroke = useRef<Point[]>([]);
  const canvasSize = useRef({ width: 300, height: 200 });

  if (!visible) return null;

  const handleGesture = (event: PanGestureHandlerGestureEvent) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      currentStroke.current.push({
        x: event.nativeEvent.x,
        y: event.nativeEvent.y,
      });
    }
  };

  const handleStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state === State.BEGAN) {
      currentStroke.current = [];
    }
    if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
      if (currentStroke.current.length > 1) {
        setStrokes((prev) => [...prev, [...currentStroke.current]]);
      }
      currentStroke.current = [];
    }
  };

  const handleClear = () => setStrokes([]);

  const handleSave = () => {
    // Convert strokes to a simple SVG data URL
    if (strokes.length === 0) return;
    const svgPaths = strokes
      .map((stroke) => {
        const points = stroke.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        return `<polyline points="${points}" fill="none" stroke="#1a1a2e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      })
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize.current.width}" height="${canvasSize.current.height}"><rect width="100%" height="100%" fill="white"/>${svgPaths}</svg>`;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    onSave(dataUrl);
    setStrokes([]);
  };

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <View style={[styles.modal, { backgroundColor: colors.surface }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <PenTool size={20} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.title, { color: colors.text }]}>{title ?? 'التوقيع الرقمي'}</Text>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surfaceAlt }]}>
            <X size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View
          style={[styles.canvas, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}
          onLayout={(e) => {
            canvasSize.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
          }}
        >
          {strokes.length === 0 && (
            <View style={styles.hintWrap}>
              <PenTool size={32} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={[styles.hintText, { color: colors.textMuted }]}>وقّع هنا بإصبعك</Text>
            </View>
          )}
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            {strokes.map((stroke, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                }}
                pointerEvents="none"
              >
                {renderStroke(stroke)}
              </View>
            ))}
          </View>
          <PanGestureHandler
            onGestureEvent={handleGesture}
            onHandlerStateChange={handleStateChange}
            minDist={1}
          >
            <View style={StyleSheet.absoluteFill} />
          </PanGestureHandler>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={handleClear} style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt }]}>
            <RotateCcw size={18} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>مسح</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 1 }]}>
            <Check size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.actionTextWhite}>تأكيد التوقيع</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function renderStroke(stroke: Point[]) {
  if (stroke.length < 2) return null;
  // Render as a series of small dots connected by lines using Views
  // Since React Native doesn't support SVG natively without a library,
  // we approximate by rendering small circles at each point
  return stroke.map((point, i) => (
    <View
      key={i}
      style={{
        position: 'absolute',
        left: point.x - 2,
        top: point.y - 2,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#1a1a2e',
      }}
    />
  ));
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { borderRadius: 20, padding: 20, width: '90%', maxWidth: 400 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottomWidth: 1, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold', flex: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  canvas: { height: 220, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  hintWrap: { alignItems: 'center', gap: 8 },
  hintText: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, paddingHorizontal: 20 },
  actionText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  actionTextWhite: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
});
