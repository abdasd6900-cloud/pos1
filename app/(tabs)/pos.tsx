import { lazy, Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '@/lib/app-context';

const TelecomPOSScreen = lazy(() => import('./pos-telecom'));
const RetailPOSScreen = lazy(() => import('./pos-retail'));

export default function POSScreen() {
  const { settings } = useApp();

  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      }
    >
      {settings.businessMode === 'telecom' ? <TelecomPOSScreen /> : <RetailPOSScreen />}
    </Suspense>
  );
}
