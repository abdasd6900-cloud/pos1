import { useApp } from '@/lib/app-context';
import TelecomPOSScreen from './pos-telecom';
import RetailPOSScreen from './pos-retail';

export default function POSScreen() {
  const { settings } = useApp();

  if (settings.businessMode === 'telecom') {
    return <TelecomPOSScreen />;
  }

  return <RetailPOSScreen />;
}
