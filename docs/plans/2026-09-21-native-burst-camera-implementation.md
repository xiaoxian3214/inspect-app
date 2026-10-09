# Native Burst Camera Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the blurry uni-app x camera wrapper with a reusable Android/iOS native camera that supports clear preview and repeated photo capture.

**Architecture:** `pages/report/camera.uvue` continues to own the media list, album selection, orientation-aware thumbnails, deletion, and confirmation flow. A new `qcm-native-camera` native-view component owns camera permission, high-quality preview, autofocus, flash, camera switching, and writing every captured JPEG to an application-local temporary path.

**Tech Stack:** uni-app x 5.24, UVue, UTS native-view, Android CameraX, iOS AVFoundation, Node.js `node:test`.

### Task 1: Lock the native camera contract

**Files:**
- Modify: `tests/camera-capture.test.mjs`

1. Require `QcmNativeCamera` and reject the built-in `<camera>` component.
2. Require semantic ready, photo, and error events plus the exposed `takePhoto` method.
3. Require Android CameraX and iOS AVFoundation implementation symbols.
4. Run the focused test and confirm it fails because the native plugin is missing.

### Task 2: Add the reusable native-view component

**Files:**
- Create: `uni_modules/qcm-native-camera/package.json`
- Create: `uni_modules/qcm-native-camera/components/qcm-native-camera/qcm-native-camera.uvue`
- Create: `uni_modules/qcm-native-camera/utssdk/app-android/config.json`
- Create: `uni_modules/qcm-native-camera/utssdk/app-ios/config.json`

1. Bind a platform native view through `UniNativeViewElement`.
2. Forward device position, flash mode, and active state to native code.
3. Forward native ready, photo, and error events as business-level component events.
4. Expose start, stop, take-photo, switch-camera, and flash update methods.

### Task 3: Implement Android CameraX capture

**Files:**
- Create: `uni_modules/qcm-native-camera/utssdk/app-android/index.uts`

1. Request the camera permission through `UTSAndroid`.
2. Bind `PreviewView`, `Preview`, and `ImageCapture` to the page lifecycle.
3. Use a high-quality preview surface and low-latency image capture.
4. Save each JPEG in the app cache directory and emit its absolute local path.
5. Support autofocus, flash cycling, camera switching, and lifecycle cleanup.

### Task 4: Implement iOS AVFoundation capture

**Files:**
- Create: `uni_modules/qcm-native-camera/utssdk/app-ios/index.uts`

1. Request AVFoundation video permission.
2. Configure `AVCaptureSession`, `AVCaptureVideoPreviewLayer`, and `AVCapturePhotoOutput`.
3. Use aspect-fill preview, continuous autofocus, and photo-quality capture.
4. Normalize photo orientation in the capture connection and write JPEG data to the temporary directory.
5. Support flash, camera switching, and session cleanup.

### Task 5: Replace the page capture layer

**Files:**
- Modify: `pages/report/camera.uvue`

1. Replace `<camera>` and `uni.createCameraContext` with `QcmNativeCamera`.
2. Append emitted native paths using the existing capture-orientation baseline.
3. Preserve album selection, thumbnail gyroscope rotation, removal, and confirmation.
4. Start and stop the native session with page visibility.

### Task 6: Verify native compatibility

1. Run the focused camera and orientation tests.
2. Run `npm test`.
3. Scan changed files for H5 DOM, SVG, Blob, browser storage, and legacy camera wrapper usage.
4. If the standard Android playground reports missing CameraX dependencies, rebuild a custom playground containing the plugin dependencies before device verification.
