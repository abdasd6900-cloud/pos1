# ملفات أندرويد الأصلية — سحاب POS

هذا المجلد يحتوي على أكواد Java الأصلية لخدمات SMS والمكالمات وأوقات العمل.

## كيف يتم الدمج

لا يتم نسخ هذه الملفات يدوياً. يتم دمجها تلقائياً في بناء EAS عبر **Expo Config Plugin** الموجود في:

```
plugins/with-sms-native/withSmsNative.ts
```

الـ Plugin يقوم بـ:
1. نسخ ملفات Java إلى `android/app/src/main/java/com/sahabpos/sms/`
2. إضافة الصلاحيات والخدمات إلى `AndroidManifest.xml`
3. تسجيل `SmsSenderPackage` في `MainApplication`

## ملاحظة مهمة حول أسماء الحزم

- اسم حزمة التطبيق في `app.json`: `com.sahab.pos`
- اسم الحزمة في ملفات Java: `com.sahabpos.sms`

هذا **مقصود وغير مشكل**. الحزمة `com.sahabpos.sms` هي حزمة Java فرعية تستضيف ملفات الخدمات. ما يهم هو أن أسماء الخدمات والمستقبلات في `AndroidManifest.xml` تستخدم المسار الكامل `com.sahabpos.sms.SmsGatewayService` (وليس `.SmsGatewayService`) حتى يجدها أندرويد.

## تحديث الملفات

عند تعديل ملف Java:
1. عدّل الملف هنا في `android-native/`
2. لا حاجة لأي خطوة إضافية — الـ Plugin ينسخها عند البناء

عند إضافة ملف Java جديد:
1. ضعه هنا في `android-native/`
2. أضف اسمه إلى مصفوفة `javaFiles` في `plugins/with-sms-native/withSmsNative.ts`

## الملفات

| الملف | الوظيفة |
|------|---------|
| SmsSenderModule.java | وحدة React Native لإرسال SMS من JavaScript |
| SmsSenderPackage.java | ربط الوحدات الأصلية مع React Native |
| SmsGatewayService.java | خدمة أمامية تستمع لطابور الرسائل في Supabase وترسلها |
| BootReceiver.java | يعيد تشغيل البوابة بعد إقلاع الجهاز |
| SmsReceiver.java | يستقبل الرسائل الواردة ويطابق أرقام الشرائح |
| CallReceiver.java | يرفض المكالمات خارج وقت العمل ويرسل رداً تلقائياً |
| CallScreeningService.java | خدمة فحص المكالمات — تعترض المكالمات قبل الرنين وترفضها خارج وقت العمل |
| CallScreeningModule.java | وحدة React Native لطلب دور فاحص المكالمات من النظام |
| CallScreeningPackage.java | ربط وحدة فحص المكالمات مع React Native |
| BusinessHoursModule.java | يربط إعدادات أوقات العمل بالأندرويد ويتحكم في عدم الإزعاج |
| AndroidManifest.xml | مرجع للصلاحيات — النسخة الفعلية يحقنها الـ Plugin |
