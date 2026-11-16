import { StyleSheet, View, Text, TouchableOpacity, Animated, Platform } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';

interface VoiceSearchBarProps {
  onResult: (text: string) => void;
  enabled: boolean;
}

export function VoiceSearchBar({ onResult, enabled }: VoiceSearchBarProps) {
  const { colors } = useTheme();
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        setSupported(true);
        const rec = new SR();
        rec.lang = 'ar-SA';
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = (e: any) => {
          const transcript = e.results[0][0].transcript;
          onResult(transcript);
          setListening(false);
        };
        rec.onerror = () => {
          setError('تعذّر التعرف على الصوت');
          setListening(false);
        };
        rec.onend = () => setListening(false);
        recognitionRef.current = rec;
      }
    }
  }, [onResult]);

  useEffect(() => {
    if (listening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [listening, pulseAnim]);

  const toggleListening = useCallback(() => {
    if (!supported) {
      setError('التعرف الصوتي غير مدعوم على هذا الجهاز');
      setTimeout(() => setError(''), 3000);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    } else {
      setError('');
      try {
        recognitionRef.current?.start();
        setListening(true);
      } catch {
        setError('تعذّر بدء الاستماع');
        setListening(false);
      }
    }
  }, [listening, supported]);

  if (!enabled) return null;

  return (
    <View>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          onPress={toggleListening}
          style={[
            styles.micBtn,
            { backgroundColor: listening ? colors.danger : colors.primary },
          ]}
          activeOpacity={0.7}
        >
          {listening ? <MicOff size={22} color="#FFFFFF" strokeWidth={2} /> : <Mic size={22} color="#FFFFFF" strokeWidth={2} />}
        </TouchableOpacity>
      </Animated.View>
      {error ? (
        <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
      ) : listening ? (
        <Text style={[styles.statusText, { color: colors.primary }]}>يتحدث...</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
});
