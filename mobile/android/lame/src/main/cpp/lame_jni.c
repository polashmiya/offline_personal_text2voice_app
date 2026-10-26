// JNI bridge for com.voicestudio.offline.util.Lame (mono 16-bit PCM → MP3, CBR).
#include <jni.h>
#include <stdint.h>
#include "lame.h"

#define FN(name) Java_com_voicestudio_offline_util_Lame_##name

JNIEXPORT jlong JNICALL FN(nativeInit)(JNIEnv *env, jobject thiz, jint inRate, jint outRate, jint bitrate) {
  (void)env;
  (void)thiz;
  lame_global_flags *flags = lame_init();
  if (!flags) return 0;
  lame_set_num_channels(flags, 1);
  lame_set_mode(flags, MONO);
  lame_set_in_samplerate(flags, inRate);
  lame_set_out_samplerate(flags, outRate);
  lame_set_VBR(flags, vbr_off);
  lame_set_brate(flags, bitrate);
  lame_set_quality(flags, 2);
  lame_set_write_id3tag_automatic(flags, 0);
  if (lame_init_params(flags) < 0) {
    lame_close(flags);
    return 0;
  }
  return (jlong)(intptr_t)flags;
}

JNIEXPORT jint JNICALL FN(nativeEncode)(JNIEnv *env, jobject thiz, jlong handle, jshortArray pcm, jint count,
                                        jbyteArray out) {
  (void)thiz;
  lame_global_flags *flags = (lame_global_flags *)(intptr_t)handle;
  if (!flags) return -100;
  jshort *samples = (*env)->GetShortArrayElements(env, pcm, NULL);
  jbyte *buffer = (*env)->GetByteArrayElements(env, out, NULL);
  jsize capacity = (*env)->GetArrayLength(env, out);
  int written = lame_encode_buffer(flags, samples, samples, count, (unsigned char *)buffer, capacity);
  (*env)->ReleaseShortArrayElements(env, pcm, samples, JNI_ABORT);
  (*env)->ReleaseByteArrayElements(env, out, buffer, 0);
  return written;
}

JNIEXPORT jint JNICALL FN(nativeFlush)(JNIEnv *env, jobject thiz, jlong handle, jbyteArray out) {
  (void)thiz;
  lame_global_flags *flags = (lame_global_flags *)(intptr_t)handle;
  if (!flags) return -100;
  jbyte *buffer = (*env)->GetByteArrayElements(env, out, NULL);
  jsize capacity = (*env)->GetArrayLength(env, out);
  int written = lame_encode_flush(flags, (unsigned char *)buffer, capacity);
  (*env)->ReleaseByteArrayElements(env, out, buffer, 0);
  return written;
}

JNIEXPORT void JNICALL FN(nativeClose)(JNIEnv *env, jobject thiz, jlong handle) {
  (void)env;
  (void)thiz;
  lame_global_flags *flags = (lame_global_flags *)(intptr_t)handle;
  if (flags) lame_close(flags);
}
