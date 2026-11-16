import { StyleSheet, View } from 'react-native';
import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Rect, ClipPath, G } from 'react-native-svg';

type AppLogoProps = {
  size?: number;
  withText?: boolean;
  variant?: 'full' | 'icon';
};

export function AppLogo({ size = 72, withText = false, variant = 'icon' }: AppLogoProps) {
  const iconSize = withText ? size : size;
  const containerSize = variant === 'full' ? size : iconSize;

  if (variant === 'full') {
    return (
      <View style={styles.fullWrap} pointerEvents="none">
        <LogoSvg size={iconSize} />
        {withText && <LogoText size={size} />}
      </View>
    );
  }

  return <View pointerEvents="none"><LogoSvg size={containerSize} /></View>;
}

function LogoSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id="logoCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#1B9B86" />
          <Stop offset="55%" stopColor="#0E7C6B" />
          <Stop offset="100%" stopColor="#0A5D50" />
        </LinearGradient>
        <LinearGradient id="logoAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#F5B568" />
          <Stop offset="100%" stopColor="#E8943B" />
        </LinearGradient>
        <LinearGradient id="logoHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <ClipPath id="logoClip">
          <Rect x="0" y="0" width="100" height="100" rx="24" />
        </ClipPath>
      </Defs>

      <G clipPath="url(#logoClip)">
        {/* Background */}
        <Rect x="0" y="0" width="100" height="100" rx="24" fill="url(#logoCloudGrad)" />

        {/* Cloud body — stylized rounded cloud */}
        <Path
          d="M30 62 C22 62 16 56 16 48 C16 41 21 36 28 35 C29 27 36 21 44 21 C51 21 57 25 60 31 C62 29 65 28 69 28 C77 28 84 34 84 43 C84 51 78 57 70 57 L30 57 Z"
          fill="#FFFFFF"
          fillOpacity="0.97"
        />

        {/* Cloud highlight overlay */}
        <Path
          d="M30 50 C24 50 20 46 20 41 C20 37 23 34 27 33 C28 28 33 24 39 24 C45 24 50 28 52 33 C53 31 55 30 58 30 C64 30 69 34 69 41 L30 41 Z"
          fill="url(#logoHighlight)"
        />

        {/* POS tag — accent colored receipt/price tag emerging from cloud */}
        <G transform="translate(52, 48) rotate(12)">
          <Rect x="0" y="0" width="34" height="26" rx="5" fill="url(#logoAccentGrad)" />
          {/* Tag hole */}
          <Circle cx="6" cy="7" r="2.2" fill="#FFFFFF" fillOpacity="0.9" />
          {/* Scan lines suggesting a receipt/barcode */}
          <Rect x="5" y="13" width="24" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.85" />
          <Rect x="5" y="18" width="18" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.65" />
          <Rect x="20" y="18" width="9" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.85" />
        </G>

        {/* Subtle dot accent — connection signal */}
        <Circle cx="22" cy="78" r="3" fill="#FFFFFF" fillOpacity="0.3" />
        <Circle cx="30" cy="78" r="3" fill="#FFFFFF" fillOpacity="0.5" />
        <Circle cx="38" cy="78" r="3" fill="#FFFFFF" fillOpacity="0.8" />
      </G>
    </Svg>
  );
}

function LogoText({ size }: { size: number }) {
  const titleFontSize = Math.max(16, size * 0.38);
  return (
    <View style={styles.textWrap} pointerEvents="none">
      <Svg width={titleFontSize * 4.2} height={titleFontSize * 1.4} viewBox="0 0 168 56" fill="none">
        <Defs>
          <LinearGradient id="logoTitleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#0E7C6B" />
            <Stop offset="100%" stopColor="#1B9B86" />
          </LinearGradient>
        </Defs>
        {/* "سحاب" stylized wordmark path — Arabic cloud-like curves */}
        <Path
          d="M20 36 C20 28 26 22 34 22 C42 22 48 28 48 36 L48 40 L42 40 C42 34 38 30 34 30 C30 30 27 33 27 37 L20 37 Z"
          fill="url(#logoTitleGrad)"
        />
        <Path
          d="M55 36 C55 28 61 22 69 22 C77 22 83 28 83 36 L83 40 L77 40 C77 34 73 30 69 30 C65 30 62 33 62 37 L55 37 Z"
          fill="url(#logoTitleGrad)"
        />
        <Path
          d="M90 40 L90 24 L96 24 L96 30 L104 30 L104 36 L96 36 L96 40 Z"
          fill="url(#logoTitleGrad)"
        />
        <Path
          d="M110 36 C110 28 116 22 124 22 C132 22 138 28 138 36 L138 40 L132 40 C132 34 128 30 124 30 C120 30 117 33 117 37 L110 37 Z"
          fill="url(#logoTitleGrad)"
        />
        <Rect x="145" y="24" width="6" height="16" rx="2" fill="url(#logoTitleGrad)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fullWrap: {
    alignItems: 'center',
    gap: 8,
  },
  textWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
