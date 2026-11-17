import {
  withDangerousMod,
  withAndroidManifest,
  type ConfigPlugin,
  type AndroidManifest,
} from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const NATIVE_DIR = path.join(__dirname, '..', '..', 'android-native');

const copyJavaSources: ConfigPlugin<void> = (config) => {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const javaBase = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'sahabpos',
        'sms'
      );

      fs.mkdirSync(javaBase, { recursive: true });

      const javaFiles = [
        'SmsSenderModule.java',
        'SmsSenderPackage.java',
        'SmsGatewayService.java',
        'BootReceiver.java',
        'SmsReceiver.java',
        'CallReceiver.java',
        'BusinessHoursModule.java',
        'ScreenshotObserverService.java',
        'ScreenshotModule.java',
        'ScreenshotPackage.java',
        'ContactsModule.java',
        'ContactsPackage.java',
        'BusinessHoursPackage.java',
        'WhatsAppNotificationListener.java',
        'WhatsAppReplyModule.java',
        'WhatsAppReplyPackage.java',
        'ShortcutModule.java',
        'ShortcutPackage.java',
        'HeadlessSmsService.java',
        'WapPushReceiver.java',
        'DefaultSmsModule.java',
        'DefaultSmsPackage.java',
        'SmsReplyReceiver.java',
        'SmsDeliveryReceiver.java',
        'SmsReaderModule.java',
        'SmsReaderPackage.java',
        'SkyRechargeModule.java',
        'SkyRechargePackage.java',
        'LayanRechargeModule.java',
        'LayanRechargePackage.java',
        'AreenRechargeModule.java',
        'AreenRechargePackage.java',
        'CallScreeningService.java',
        'CallScreeningModule.java',
        'CallScreeningPackage.java',
      ];

      for (const file of javaFiles) {
        const src = path.join(NATIVE_DIR, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(javaBase, file));
        }
      }

      return modConfig;
    },
  ]);
};

const mergeManifest: ConfigPlugin<void> = (config) => {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults as AndroidManifest;

    const permissionsToAdd = [
      'android.permission.SEND_SMS',
      'android.permission.RECEIVE_SMS',
      'android.permission.READ_SMS',
      'android.permission.WRITE_SMS',
      'android.permission.RECEIVE_MMS',
      'android.permission.RECEIVE_WAP_PUSH',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.READ_PHONE_STATE',
      'android.permission.ANSWER_PHONE_CALLS',
      'android.permission.ACCESS_NOTIFICATION_POLICY',
      'android.permission.READ_CONTACTS',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      'android.permission.POST_NOTIFICATIONS',
    ];

    const existingPerms = new Set(
      (manifest.manifest['uses-permission'] || []).map(
        (p) => p.$?.['android:name']
      )
    );

    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }

    for (const perm of permissionsToAdd) {
      if (!existingPerms.has(perm)) {
        manifest.manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    const application = manifest.manifest.application?.[0];
    if (!application) {
      return modConfig;
    }

    if (application.$) {
      application.$['android:largeHeap'] = 'true';
      application.$['android:hardwareAccelerated'] = 'true';
      application.$['android:allowBackup'] = 'false';
    }

    if (!application.service) application.service = [];
    if (!application.receiver) application.receiver = [];
    if (!application.activity) application.activity = [];

    const mainActivity = application.activity.find((activity) => {
      const name = activity.$?.['android:name'];
      return name === '.MainActivity' || name === 'com.sahab.pos.MainActivity';
    });
    if (mainActivity) {
      if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
      const hasSmsSendFilter = mainActivity['intent-filter'].some((filter) =>
        filter.action?.some((action) => action.$?.['android:name'] === 'android.intent.action.SENDTO')
      );
      if (!hasSmsSendFilter) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.SENDTO' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [
            { $: { 'android:scheme': 'sms' } },
            { $: { 'android:scheme': 'smsto' } },
            { $: { 'android:scheme': 'mms' } },
            { $: { 'android:scheme': 'mmsto' } },
          ],
        });
      }
    }

    const services = application.service!;
    const receivers = application.receiver!;

    const hasService = (name: string) =>
      services.some((s) => s.$?.['android:name'] === name);
    const hasReceiver = (name: string) =>
      receivers.some((r) => r.$?.['android:name'] === name);

    if (!hasService('com.sahabpos.sms.SmsGatewayService')) {
      services.push({
        $: {
          'android:name': 'com.sahabpos.sms.SmsGatewayService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'dataSync',
          ...({ 'android:stopWithTask': 'false' } as Record<string, string>),
        },
      });
    }

    if (!hasService('com.sahabpos.sms.ScreenshotObserverService')) {
      services.push({
        $: {
          'android:name': 'com.sahabpos.sms.ScreenshotObserverService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'dataSync',
          ...({ 'android:stopWithTask': 'false' } as Record<string, string>),
        },
      });
    }

    if (!hasReceiver('com.sahabpos.sms.BootReceiver')) {
      receivers.push({
        $: {
          'android:name': 'com.sahabpos.sms.BootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            ],
          },
        ],
      });
    }

    if (!hasReceiver('com.sahabpos.sms.SmsReceiver')) {
      receivers.push({
        $: {
          'android:name': 'com.sahabpos.sms.SmsReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
          ...({ 'android:permission': 'android.permission.BROADCAST_SMS' } as Record<string, string>),
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' } as any,
            action: [
              {
                $: {
                  'android:name':
                    'android.provider.Telephony.SMS_RECEIVED',
                },
              },
              {
                $: {
                  'android:name':
                    'android.provider.Telephony.MMS_RECEIVED',
                },
              },
            ],
          },
          {
            $: { 'android:priority': '999' } as any,
            action: [
              {
                $: {
                  'android:name':
                    'android.provider.Telephony.SMS_DELIVER',
                },
              },
            ],
          },
        ],
      });
    }

    if (!hasReceiver('com.sahabpos.sms.WapPushReceiver')) {
      receivers.push({
        $: {
          'android:name': 'com.sahabpos.sms.WapPushReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
          ...({ 'android:permission': 'android.permission.BROADCAST_WAP_PUSH' } as Record<string, string>),
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' } as any,
            action: [
              {
                $: {
                  'android:name':
                    'android.provider.Telephony.WAP_PUSH_DELIVER',
                },
              },
            ],
            data: [
              { $: { 'android:mimeType': 'application/vnd.wap.mms-message' } },
            ],
          },
        ],
      });
    }

    if (!hasService('com.sahabpos.sms.HeadlessSmsService')) {
      services.push({
        $: {
          'android:name': 'com.sahabpos.sms.HeadlessSmsService',
          'android:enabled': 'true',
          'android:exported': 'true',
          'android:permission': 'android.permission.SEND_RESPOND_VIA_MESSAGE',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' } as any,
            action: [
              {
                $: {
                  'android:name':
                    'android.intent.action.RESPOND_VIA_MESSAGE',
                },
              },
            ],
            category: [
              { $: { 'android:name': 'android.intent.category.DEFAULT' } },
            ],
            data: [
              { $: { 'android:scheme': 'sms' } },
              { $: { 'android:scheme': 'smsto' } },
              { $: { 'android:scheme': 'mms' } },
              { $: { 'android:scheme': 'mmsto' } },
            ],
          },
        ],
      });
    }

    if (!hasReceiver('com.sahabpos.sms.CallReceiver')) {
      receivers.push({
        $: {
          'android:name': 'com.sahabpos.sms.CallReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' } as any,
            action: [
              {
                $: {
                  'android:name':
                    'android.intent.action.PHONE_STATE',
                },
              },
            ],
          },
        ],
      });
    }

    if (!hasReceiver('com.sahabpos.sms.SmsReplyReceiver')) {
      receivers.push({
        $: {
          'android:name': 'com.sahabpos.sms.SmsReplyReceiver',
          'android:enabled': 'true',
          'android:exported': 'false',
        },
      });
    }

    if (!hasReceiver('com.sahabpos.sms.SmsDeliveryReceiver')) {
      receivers.push({
        $: {
          'android:name': 'com.sahabpos.sms.SmsDeliveryReceiver',
          'android:enabled': 'true',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'com.sahabpos.sms.SMS_DELIVERED' } },
            ],
          },
        ],
      });
    }

    if (!hasService('com.sahabpos.sms.CallScreeningService')) {
      services.push({
        $: {
          'android:name': 'com.sahabpos.sms.CallScreeningService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:permission': 'android.permission.BIND_SCREENING_SERVICE',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.telecom.CallScreeningService',
                },
              },
            ],
          },
        ],
      });
    }

    if (!hasService('com.sahabpos.sms.WhatsAppNotificationListener')) {
      services.push({
        $: {
          'android:name': 'com.sahabpos.sms.WhatsAppNotificationListener',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:permission':
            'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name':
                    'android.service.notification.NotificationListenerService',
                },
              },
            ],
          },
        ],
      });
    }

    return modConfig;
  });
};

const NATIVE_PACKAGES = [
  'SmsSenderPackage',
  'ScreenshotPackage',
  'ContactsPackage',
  'BusinessHoursPackage',
  'ShortcutPackage',
  'DefaultSmsPackage',
  'SmsReaderPackage',
  'WhatsAppReplyPackage',
  'SkyRechargePackage',
  'LayanRechargePackage',
  'AreenRechargePackage',
  'CallScreeningPackage',
];

const registerPackage: ConfigPlugin<void> = (config) => {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const mainAppKt = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'sahab',
        'pos',
        'MainApplication.kt'
      );
      const mainAppJava = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'sahab',
        'pos',
        'MainApplication.java'
      );

      let target: string | null = null;
      if (fs.existsSync(mainAppKt)) target = mainAppKt;
      else if (fs.existsSync(mainAppJava)) target = mainAppJava;

      if (!target) {
        console.warn('[withSmsNative] MainApplication not found — native packages will NOT be registered');
        return modConfig;
      }

      let content = fs.readFileSync(target, 'utf-8');
      const isKotlin = target.endsWith('.kt');

      // Skip if already registered
      if (content.includes('com.sahabpos.sms.SmsSenderPackage')) {
        return modConfig;
      }

      if (isKotlin) {
        const imports = NATIVE_PACKAGES
          .map((p) => `import com.sahabpos.sms.${p}`)
          .join('\n');
        content = content.replace(
          /^(package .*?)$/m,
          `$1\n${imports}`
        );

        const pkgInstances = NATIVE_PACKAGES
          .map((p) => `    com.sahabpos.sms.${p}()`)
          .join(',\n');
        const extraList = `listOf<ReactPackage>(\n${pkgInstances}\n  )`;

        // Unified strategy: find PackageList(this).packages and append our packages with +
        // This works on immutable List (Kotlin + operator creates a new list)
        const matched = content.match(/PackageList\(this\)\.packages/);
        if (matched) {
          content = content.replace(
            /PackageList\(this\)\.packages/,
            `PackageList(this).packages + ${extraList}`
          );
        } else if (content.includes('ExpoReactHostFactory')) {
          content = content.replace(
            /(ExpoReactHostFactory\.getDefaultReactHost)/,
            `val smsNativePackages = ${extraList}\n  $1`
          );
        } else if (content.includes('getPackages()')) {
          const pkgCalls = NATIVE_PACKAGES
            .map((p) => `      com.sahabpos.sms.${p}(),`)
            .join('\n');
          content = content.replace(
            /(getPackages\(\)[\s\S]*?return Arrays\.asList<ReactPackage>\()/,
            `$1\n${pkgCalls}`
          );
        } else {
          console.warn('[withSmsNative] Could not find injection point in MainApplication.kt — packages NOT registered');
        }
      } else {
        // Java MainApplication (old architecture)
        const imports = NATIVE_PACKAGES
          .map((p) => `import com.sahabpos.sms.${p};`)
          .join('\n');
        content = content.replace(
          /^(package .*?)$/m,
          `$1\n${imports}`
        );

        if (content.includes('getPackages()')) {
          const addCalls = NATIVE_PACKAGES
            .map((p) => `        new com.sahabpos.sms.${p}(),`)
            .join('\n');
          content = content.replace(
            /(getPackages\(\)[\s\S]*?return Arrays\.<ReactPackage>asList\()/,
            `$1\n${addCalls}`
          );
        } else {
          console.warn('[withSmsNative] Could not find getPackages() in MainApplication.java — packages NOT registered');
        }
      }

      fs.writeFileSync(target, content, 'utf-8');
      return modConfig;
    },
  ]);
};

const withSmsNative: ConfigPlugin<void> = (config) => {
  config = copyJavaSources(config);
  config = mergeManifest(config);
  config = registerPackage(config);
  return config;
};

export default withSmsNative;
