import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import {
  documentDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

export async function exportXlsx(wb: XLSX.WorkBook, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, filename);
    return;
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  const fileUri = `${documentDirectory}${filename}`;

  await writeAsStringAsync(fileUri, wbout, {
    encoding: EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: filename,
    });
  }

  try {
    await deleteAsync(fileUri, { idempotent: true });
  } catch {
    // cleanup is best-effort
  }
}

export interface PickedFile {
  uri: string;
  name: string;
  size?: number;
}

export async function pickExcelFile(): Promise<PickedFile | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }
    const asset = result.assets[0];
    return { uri: asset.uri, name: asset.name, size: asset.size };
  } catch {
    return null;
  }
}

export async function readPickedExcel(file: PickedFile): Promise<XLSX.WorkBook> {
  if (Platform.OS === 'web') {
    throw new Error('Use FileReader on web');
  }
  const base64 = await readAsStringAsync(file.uri, {
    encoding: EncodingType.Base64,
  });
  return XLSX.read(base64, { type: 'base64', cellDates: true });
}
