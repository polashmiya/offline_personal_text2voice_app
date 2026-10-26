package com.voicestudio.offline

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.voicestudio.offline.audio.AudioToolsModule
import com.voicestudio.offline.engine.VoiceEngineModule
import com.voicestudio.offline.files.FileBridgeModule
import com.voicestudio.offline.recorder.VoiceRecorderModule

/** Registers the app's TurboModules. */
class VoiceStudioPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    when (name) {
      VoiceEngineModule.NAME -> VoiceEngineModule(reactContext)
      AudioToolsModule.NAME -> AudioToolsModule(reactContext)
      FileBridgeModule.NAME -> FileBridgeModule(reactContext)
      VoiceRecorderModule.NAME -> VoiceRecorderModule(reactContext)
      else -> null
    }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    listOf(VoiceEngineModule.NAME, AudioToolsModule.NAME, FileBridgeModule.NAME, VoiceRecorderModule.NAME)
      .associateWith { name ->
        ReactModuleInfo(
          name,
          name,
          false, // canOverrideExistingModule
          false, // needsEagerInit
          false, // isCxxModule
          true, // isTurboModule
        )
      }
  }
}
