#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const androidDir = path.join(__dirname, 'android');
const targetFile = path.join(androidDir, 'local.properties');

const candidates = {
  win32: [
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
    'C:\\Android\\Sdk',
  ],
  darwin: [
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    '/usr/local/share/android-sdk',
  ],
  linux: [
    path.join(os.homedir(), 'Android', 'Sdk'),
    path.join(os.homedir(), 'android-sdk'),
    '/opt/android-sdk',
  ],
};

const platform = os.platform();
const dirs = candidates[platform] || candidates.linux;

let sdkPath = dirs.find((d) => fs.existsSync(d));

if (!sdkPath) {
  console.error('');
  console.error('لم يتم العثور على Android SDK تلقائياً.');
  console.error('البحث تم في هذه المسارات:');
  dirs.forEach((d) => console.error('  - ' + d));
  console.error('');
  console.error('الحل:');
  console.error('1. افتح Android Studio');
  console.error('2. اذهب إلى: File → Settings → Languages & Frameworks → Android SDK');
  console.error('3. انسخ مسار "Android SDK Location"');
  console.error('4. أنشئ ملف android/local.properties يدوياً واكتب داخله:');
  console.error('   sdk.dir=<المسار_الذي_نسخته>');
  console.error('');
  process.exit(1);
}

const content = `sdk.dir=${sdkPath.replace(/\\/g, '\\\\')}\n`;

fs.writeFileSync(targetFile, content, 'utf8');

console.log('');
console.log('تم إنشاء ملف local.properties بنجاح!');
console.log('المسار: ' + targetFile);
console.log('مسار SDK: ' + sdkPath);
console.log('');
