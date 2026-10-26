cmake_minimum_required(VERSION 3.22)
project(lamejni C)

# LAME 3.100 (LGPL-2.0+), vendored unmodified from lame-3.100.tar.gz
# (sha256 ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e).
# Built as a separate shared library to keep LGPL obligations simple.
file(GLOB LAME_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/lame/*.c)

add_library(lamejni SHARED lame_jni.c ${LAME_SOURCES})

target_include_directories(lamejni PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/lame)
target_compile_definitions(lamejni PRIVATE
  STDC_HEADERS=1
  HAVE_STDINT_H=1
  HAVE_INTTYPES_H=1
  HAVE_ERRNO_H=1
  HAVE_FCNTL_H=1
  HAVE_LIMITS_H=1
  ieee754_float32_t=float
)
target_compile_options(lamejni PRIVATE -O2 -w)
target_link_libraries(lamejni log m)
target_link_options(lamejni PRIVATE "-Wl,-z,max-page-size=16384")
