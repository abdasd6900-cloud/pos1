import { Platform } from 'react-native';
import {
  documentDirectory,
  writeAsStringAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function shareBackupFile(jsonContent: string, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = `${documentDirectory}${filename}`;
  await writeAsStringAsync(fileUri, jsonContent, {
    encoding: EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'مشاركة النسخة الاحتياطية',
    });
  }

  try {
    await deleteAsync(fileUri, { idempotent: true });
  } catch {
    // cleanup is best-effort
  }
}

export async function pickBackupFile(): Promise<string | null> {
  try {
    const result = await (await import('expo-document-picker')).getDocumentAsync({
      type: ['application/json', 'text/plain', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }
    const asset = result.assets[0];
    if (Platform.OS === 'web') {
      if (!asset.file) return null;
      const text = await asset.file.text();
      return text;
    }
    const { readAsStringAsync } = await import('expo-file-system/legacy');
    return await readAsStringAsync(asset.uri, { encoding: EncodingType.UTF8 });
  } catch {
    return null;
  }
}
