package com.sahab.pos
import com.sahabpos.sms.SmsSenderPackage
import com.sahabpos.sms.ScreenshotPackage
import com.sahabpos.sms.ContactsPackage
import com.sahabpos.sms.BusinessHoursPackage
import com.sahabpos.sms.ShortcutPackage
import com.sahabpos.sms.DefaultSmsPackage
import com.sahabpos.sms.SmsReaderPackage
import com.sahabpos.sms.WhatsAppReplyPackage
import com.sahabpos.sms.SkyRechargePackage
import com.sahabpos.sms.LayanRechargePackage
import com.sahabpos.sms.CallScreeningPackage
import com.sahabpos.sms.AreenRechargePackage

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages + listOf<ReactPackage>(
    com.sahabpos.sms.SmsSenderPackage(),
    com.sahabpos.sms.ScreenshotPackage(),
    com.sahabpos.sms.ContactsPackage(),
    com.sahabpos.sms.BusinessHoursPackage(),
    com.sahabpos.sms.ShortcutPackage(),
    com.sahabpos.sms.DefaultSmsPackage(),
    com.sahabpos.sms.SmsReaderPackage(),
    com.sahabpos.sms.WhatsAppReplyPackage(),
    com.sahabpos.sms.SkyRechargePackage(),
    com.sahabpos.sms.LayanRechargePackage(),
    com.sahabpos.sms.CallScreeningPackage(),
    com.sahabpos.sms.AreenRechargePackage()
  ).apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
