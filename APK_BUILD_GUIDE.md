# دليل بناء APK — سحاب POS

## نظرة عامة

التطبيق يحتوي على أكواد أندرويد أصلية (Java) لخدمات SMS والمكالمات وأوقات العمل. هذه الملفات موجودة في مجلد `android-native/` ويتم دمجها تلقائياً في بناء EAS عبر **Expo Config Plugin** في `plugins/with-sms-native/withSmsNative.js`.

## كيف يعمل الدمج التلقائي

عند تشغيل `eas build` أو `npx expo prebuild`، يقوم الـ Config Plugin بثلاثة أمور تلقائياً:

1. **نسخ ملفات Java** من `android-native/` إلى `android/app/src/main/java/com/sahabpos/sms/`
2. **إضافة الصلاحيات والخدمات والمستقبلات** إلى ملف `AndroidManifest.xml` المولّد
3. **تسجيل الحزم الأصلية** (Packages) في `MainApplication` لتكون متاحة من JavaScript

لا حاجة لأي خطوات يدوية — كل شيء يتم أثناء البناء.

## هيكل الملفات

```
project/
├── android-native/          ← الملفات الأصلية المرجعية
│   ├── AndroidManifest.xml  ← مرجع للصلاحيات (الفعلي يُحقن تلقائياً)
│   ├── SmsSenderModule.java
│   ├── SmsSenderPackage.java
│   ├── SmsGatewayService.java
│   ├── BootReceiver.java
│   ├── SmsReceiver.java
│   ├── CallReceiver.java
│   ├── BusinessHoursModule.java
│   ├── AreenRechargeModule.java
│   ├── AreenRechargePackage.java
│   ├── SkyRechargeModule.java
│   ├── SkyRechargePackage.java
│   ├── LayanRechargeModule.java
│   ├── LayanRechargePackage.java
│   ├── CallScreeningService.java
│   ├── CallScreeningModule.java
│   ├── CallScreeningPackage.java
│   ├── SmsDeliveryReceiver.java
│   └── ... (بقية الملفات)
├── plugins/
│   └── with-sms-native/
│       └── withSmsNative.js ← Config Plugin الفعلي المستخدم
├── app.json                 ← يذكر الـ Plugin في مصفوفة plugins
└── eas.json                 ← إعدادات البناء
```

## متى تحتاج ملفات الناتيف للتحديث؟

- عند إضافة ملف Java جديد: ضعه في `android-native/` وأضف اسمه في مصفوفة `javaFiles` داخل `withSmsNative.js`
- عند إضافة حزمة (Package) جديدة: أضف اسمها في مصفوفة `NATIVE_PACKAGES` داخل `withSmsNative.js`
- عند تغيير الصلاحيات: حدّث مصفوفتي `permissionsToAdd` في `withSmsNative.js` و `android.permissions` في `app.json`
- عند تغيير اسم حزمة التطبيق: حدّث `android.package` في `app.json` فقط — لا تغيّر `package com.sahabpos.sms` في ملفات Java

## خطوات بناء APK

### الطريقة الأولى: بناء محلي عبر Android Studio (موصى بها)

استخدم هذه الطريقة لتجنب قيود سحابة EAS (عدد بناءات محدود على الخطة المجانية).

#### المتطلبات
- Node.js 18+
- Android Studio (مع Android SDK 35+)
- JDK 17

#### 1. توليد مشروع Android الأصلي
```bash
npm run prebuild:android
```
هذا ينشئ مجلد `android/`، ويدمج ملفات Java والصلاحيات والخدمات تلقائياً عبر الـ Config Plugin. لا تستخدم خيار `--clean` في البناء المعتاد لأنه يحذف المجلد المولّد وملفاته المحلية.

#### 2. ربط Android SDK محلياً

إذا ظهر خطأ `SDK location not found`، افتح مجلد `android/` وأنشئ ملفاً باسم `local.properties` وضع داخله مسار Android SDK على جهازك، مثل:

```properties
sdk.dir=C:\\Users\\اسم_المستخدم\\AppData\\Local\\Android\\Sdk
```

هذا الملف خاص بجهازك ولا يجب نقله إلى جهاز آخر.

#### 3. فتح المشروع في Android Studio
- افتح Android Studio
- اختر File → Open ثم حدد مجلد `android/` داخل المشروع
- انتظر حتى يكتمل Gradle Sync

#### 4. بناء APK
- من القائمة: Build → Build Bundle(s) / APK(s) → Build APK(s)
- أو من سطر الأوامر:
```bash
cd android && ./gradlew assembleRelease
```

#### 5. العثور على ملف APK
سيكون الملف في:
```
android/app/build/outputs/apk/release/app-release.apk
```
أو للنسخة التجريبية:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

#### 6. تثبيت الـ APK
1. انسخ ملف APK إلى هاتف Android
2. فعّل "تثبيت تطبيقات من مصادر غير معروفة" من الإعدادات
3. افتح ملف APK واتبع التعليمات
4. بعد الفتح، امنح الأذونات: SMS، المكالمات، عدم الإزعاج، جهات الاتصال

---

### الطريقة الثانية: بناء عبر سحابة EAS

استخدم هذه الطريقة إذا كان لديك اشتراك مدفوع في Expo.

#### المتطلبات
- Node.js 18+
- EAS CLI: `npm install -g eas-cli`
- حساب Expo على https://expo.dev

#### 1. تسجيل الدخول
```bash
eas login
```

#### 2. بناء APK تجريبي
```bash
eas build --platform android --profile preview
```

#### 3. بناء APK للإنتاج
```bash
eas build --platform android --profile production
```

#### 4. تحميل الـ APK
بعد اكتمال البناء، سيظهر رابط تحميل مباشر في الطرفية. أو:
```bash
eas build:list --platform android --status finished
```

#### 5. تثبيت الـ APK
نفس خطوات الطريقة الأولى أعلاه.

## الصلاحيات المطلوبة

التطبيق يطلب هذه الأذونات وقت التشغيل (ليس عند الإقلاع):

| الإذن | الغرض |
|-------|-------|
| SEND_SMS | إرسال رسائل المعاملات للعملاء |
| RECEIVE_SMS | استقبال ردود العملاء والمطابقة |
| READ_SMS | قراءة رسائل المطابقة |
| WRITE_SMS | دعم تكامل تطبيق الرسائل الافتراضي |
| RECEIVE_MMS / RECEIVE_WAP_PUSH | استقبال رسائل الوسائط |
| POST_NOTIFICATIONS | عرض تنبيهات الرسائل على Android 13+ |
| FOREGROUND_SERVICE | تشغيل بوابة SMS في الخلفية |
| FOREGROUND_SERVICE_DATA_SYNC | نوع خدمة المزامنة |
| RECEIVE_BOOT_COMPLETED | إعادة تشغيل البوابة بعد إقلاع الجهاز |
| READ_PHONE_STATE | معرفة حالة المكالمات الواردة |
| ANSWER_PHONE_CALLS | الرد على المكالمات |
| ACCESS_NOTIFICATION_POLICY | التحكم في وضع عدم الإزعاج |
| READ_CONTACTS | عرض أسماء المرسلين |
| BIND_SCREENING_SERVICE | فلترة المكالمات الواردة |
| BIND_NOTIFICATION_LISTENER_SERVICE | قراءة إشعارات WhatsApp |

## ملاحظات مهمة

- إذن «عدم الإزعاج» لا يُمنح تلقائياً — يجب على المستخدم فتح إعدادات الأندرويد ومنح التطبيق وصولاً خاصاً
- إذن قراءة الإشعارات (Notification Listener) يحتاج تفعيل يدوي من إعدادات الأندرويد
- لا تنشر التطبيق على Google Play إذا كان يرسل SMS تلقائياً — سياسات Play تمنع ذلك
- الجهاز الذي يعمل كبوابة SMS يجب أن يبقى متصلاً بالإنترنت
- عند أول بناء، اربط المشروع بحساب Expo عند طلب EAS ذلك؛ لا تضع معرّفاً فارغاً داخل `app.json`

## استكشاف الأخطاء

### التطبيق يغلق فور الفتح
- تأكد أن `app.json` يحتوي على الـ Plugin: `"./plugins/with-sms-native/withSmsNative.js"`
- تأكد أن `android.package` في `app.json` هو `com.sahab.pos`
- لا تغيّر `package com.sahabpos.sms` في ملفات Java — هذه الحزمة الفرعية صحيحة

### الصلاحيات لا تظهر
- تأكد أن مصفوفة `android.permissions` في `app.json` ليست فارغة
- أعد البناء بعد تعديل `app.json`

### وحدة SMS غير متوفرة
- هذا طبيعي على الويب — الميزات الأصلية تعمل فقط على أندرويد
- على أندرويد، تأكد أن الـ Plugin يعمل بفتح سجل البناء والبحث عن `SmsSenderPackage`

### وحدة AreenRecharge غير متوفرة
- تأكد أن `AreenRechargeModule.java` و `AreenRechargePackage.java` موجودان في `android-native/`
- تأكد أن `AreenRechargePackage` مذكور في مصفوفة `NATIVE_PACKAGES` في `withSmsNative.js`

### مكالمات لا تُفلتر (Call Screening)
- تأكد أن `CallScreeningService` مذكور في `mergeManifest` داخل `withSmsNative.js`
- امنح التطبيق دور «تطبيق تصفية المكالمات» من إعدادات الأندرويد
