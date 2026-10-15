<template>
	<view>
		<slot />
	</view>
</template>

<script lang="uts">
import FrameLayout from 'android.widget.FrameLayout'
import View from 'android.view.View'
import {
	ImaCameraManager,
	ImaCameraPermission,
	ImaCameraUtils,
	ListenerOptions
} from 'com.maxiaoqu.imacamera'

let cameraDestroying = false

function destroyCameraView() {
	if (cameraDestroying) {
		return
	}
	cameraDestroying = true
	try {
		ImaCameraManager.destroyCameraView()
	} finally {
		cameraDestroying = false
	}
}

function startRecordingWithDuration(maxDurationMs : number) {
	ImaCameraManager.startRecording(null, null, false, maxDurationMs.toLong())
}

function applyCameraZoom(ratio : number) {
	ImaCameraManager.setCameraZoom(ratio.toFloat())
}

function vibrateDevice(duration : number = 300) {
	ImaCameraUtils.vibrate((duration ?? 300).toLong())
}

export default {
	name: 'ima-camerax-view',
	props: {
		mode: {
			type: String,
			default: 'picture'
		},
		facing: {
			type: String,
			default: 'back'
		},
		flash: {
			type: String,
			default: 'off'
		},
		previewCornerRadius: {
			type: Number,
			default: 0
		},
		previewCornerRadiusRate: {
			type: Number,
			default: 0
		},
		whiteBalance: {
			type: String,
			default: 'auto'
		},
		hdr: {
			type: String,
			default: 'off'
		},
		audio: {
			type: String,
			default: 'on'
		},
		photoSuffix: {
			type: String,
			default: 'jpeg'
		},
		photoResolution: {
			type: String,
			default: 'medium'
		},
		orientation: {
			type: String,
			default: 'auto'
		},
		shutter: {
			type: Boolean,
			default: true
		},
		sound: {
			type: String,
			default: ''
		},
		vibrate: {
			type: Boolean,
			default: false
		},
		duration: {
			type: Number,
			default: 300
		},
		gallery: {
			type: Boolean,
			default: false
		},
		grid: {
			type: String,
			default: 'off'
		},
		gridColor: {
			type: String,
			default: '#808080'
		},
		recorder: {
			type: Boolean,
			default: true
		},
		sound2: {
			type: String,
			default: ''
		},
		shortcut: {
			type: Boolean,
			default: false
		},
		pinchZoom: {
			type: Boolean,
			default: true
		},
		tapToFocus: {
			type: Boolean,
			default: true
		},
		previewRotation: {
			type: Number,
			default: 0
		}
	},
	data() {
		return {
			// #ifdef UNI-APP-X
			uniAppX: true,
			// #endif
			// #ifndef UNI-APP-X
			uniAppX: false,
			// #endif
			saveToGallery: false,
			cameraFacing: 'back',
			cameraZoom: 0,
			linearZoomValue: 0,
			exposureValue: 0,
			cameraPermissionGranted: false,
			permissionRequesting: false
		}
	},
	emits: [
		'onCamera',
		'onCameraOpened',
		'onCameraClosed',
		'onPictureTaken',
		'onVideoTakenStart',
		'onVideoTakenEnd',
		'onVideoTakenProgress',
		'onFocusStart',
		'onAutoFocusStart',
		'onFocusEnd',
		'onZoomChanged',
		'onCameraChange',
		'onOrientationChanged',
		'onCameraTakenError',
		'onCameraError'
	],
	expose: [
		'open',
		'reopen',
		'close',
		'destroyCamera',
		'takePhoto',
		'takePhotoSnapshot',
		'takeVideo',
		'takeVideoSnapshot',
		'stopVideo',
		'changeZoom',
		'setCameraZoom',
		'changeWideAngle',
		'changeZoomNormal',
		'changeExposure',
		'changeWhiteBalance',
		'changeHdr',
		'changeFacing',
		'changeMode',
		'changeOrientation',
		'changeGrid',
		'changeFlash',
		'changeAudio',
		'changeSuffix',
		'changePhotoResolution',
		'changeSizeSelectors',
		'changePreviewCorner',
		'changeGallery',
		'changePinchZoom',
		'changeTapToFocus',
		'changePreviewRotation',
		'openAppSettings',
		'isOpened'
	],
	watch: {
		facing: {
			handler(newValue : String) {
				this.cameraFacing = newValue
				this.changeFacing(newValue)
			},
			immediate: false
		},
		flash: {
			handler(newValue : String) {
				this.changeFlash(newValue)
			},
			immediate: false
		},
		whiteBalance: {
			handler(newValue : String) {
				this.changeWhiteBalance(newValue)
			},
			immediate: true
		},
		hdr: {
			handler(newValue : String) {
				this.changeHdr(newValue)
			},
			immediate: true
		},
		audio: {
			handler(newValue : String) {
				this.changeAudio(newValue)
			},
			immediate: false
		},
		photoSuffix: {
			handler(newValue : String) {
				this.changeSuffix(newValue)
			},
			immediate: true
		},
		photoResolution: {
			handler(newValue : String) {
				this.changePhotoResolution(newValue)
			},
			immediate: false
		},
		orientation: {
			handler(newValue : String) {
				this.changeOrientation(newValue)
			},
			immediate: true
		},
		gallery: {
			handler(newValue : Boolean) {
				this.changeGallery(newValue)
			},
			immediate: true
		},
		previewCornerRadius: {
			handler(newValue ?: Number) {
				this.changePreviewCorner(newValue, this.previewCornerRadiusRate)
			},
			immediate: true
		},
		previewCornerRadiusRate: {
			handler(newValue ?: Number) {
				this.changePreviewCorner(this.previewCornerRadius, newValue)
			},
			immediate: true
		},
		grid: {
			handler(newValue : String) {
				this.changeGrid(newValue, this.gridColor)
			},
			immediate: true
		},
		recorder: {
			handler(newValue : Boolean) {
				ImaCameraManager.setRecordSoundEnabled(newValue)
			},
			immediate: true
		},
		sound2: {
			handler(newValue : String) {
				ImaCameraManager.setRecordSoundFile(newValue ?? '')
			},
			immediate: true
		},
		shortcut: {
			handler(newValue : Boolean) {
				if (newValue) {
					this.shortcutListener()
				} else {
					ImaCameraManager.destroyKeyListener()
				}
			},
			immediate: true
		},
		pinchZoom: {
			handler(newValue : Boolean) {
				ImaCameraManager.setPinchZoomEnabled(newValue ?? true)
			},
			immediate: true
		},
		tapToFocus: {
			handler(newValue : Boolean) {
				ImaCameraManager.setTapToFocusEnabled(newValue ?? true)
			},
			immediate: true
		},
		previewRotation: {
			handler(newValue : Number) {
				ImaCameraManager.setPreviewRotation(newValue.toFloat())
			},
			immediate: true
		}
	},
	methods: {
		setPreviewVisible(visible : boolean) {
			if (this.$el == null) {
				return
			}
			const previewLayout = this.$el as FrameLayout
			previewLayout.setVisibility(visible ? View.VISIBLE : View.GONE)
		},
		applyPreviewReady(success : boolean, message : string) {
			if (success) {
				this.changePreviewCorner(this.previewCornerRadius, this.previewCornerRadiusRate)
				this.changeGrid(this.grid, this.gridColor)
				this.changeWhiteBalance(this.whiteBalance)
				this.changeHdr(this.hdr)
				this.changeSuffix(this.photoSuffix)
				this.changePhotoResolution(this.photoResolution)
				this.changeOrientation(this.orientation)
				this.changeAudio(this.audio)
				this.changeFacing(this.facing)
				this.changeFlash(this.flash)
				ImaCameraManager.setRecordSoundEnabled(this.recorder)
				ImaCameraManager.setRecordSoundFile(this.sound2 ?? '')
				ImaCameraManager.setPinchZoomEnabled(this.pinchZoom)
				ImaCameraManager.setTapToFocusEnabled(this.tapToFocus)
				this.setPreviewVisible(this.cameraPermissionGranted && !this.permissionRequesting)
				this.initCamera()
			} else {
				console.warn(`相机初始化失败: ${message}`)
			}
		},
		initCameraView() : FrameLayout {
			return ImaCameraManager.createPreviewView((success : boolean, message : string) => {
				this.applyPreviewReady(success, message)
			})
		},
		openCameraIfPermitted() : boolean {
			if (!this.cameraPermissionGranted) {
				return false
			}
			ImaCameraManager.open()
			return true
		},
		initCameraPermission() {
			if (this.permissionRequesting) {
				return
			}
			this.permissionRequesting = true
			// 权限弹窗阶段隐藏原生预览层，避免遮挡弹框/首开黑屏
			this.setPreviewVisible(false)
			ImaCameraPermission.apply((allRight : boolean, grantedList : Array<string>) => {
				this.permissionRequesting = false
				if (allRight) {
					this.cameraPermissionGranted = true
					this.setPreviewVisible(true)
					console.log(`相机权限已授予: ${grantedList}`)
					// 权限弹窗期间 open 可能已失败，授权后补开预览
					if (!this.isOpened()) {
						this.openCameraIfPermitted()
					}
				} else {
					this.cameraPermissionGranted = false
					this.setPreviewVisible(false)
					console.warn(`部分权限被拒绝: ${grantedList}`)
				}
			}, (doNotAskAgain : boolean, grantedList : Array<string>) => {
				this.permissionRequesting = false
				this.cameraPermissionGranted = false
				this.setPreviewVisible(false)
				if (doNotAskAgain) {
					ImaCameraPermission.openAppSettings()
					console.warn(`权限被永久拒绝: ${grantedList}`)
				}
			})
		},
		initCamera() {
			const uniAppX = this.uniAppX
			ImaCameraManager.setEventListener((event : string, data : any) => {
				switch (event) {
					case 'opened':
						this.$emit('onCameraOpened', data)
						this.$emit('onCamera', data)
						break
					case 'closed':
						this.$emit('onCameraClosed', data)
						break
					case 'photo':
						this.$emit('onPictureTaken', data)
						break
					case 'videoStart':
						this.$emit('onVideoTakenStart', data)
						break
					case 'videoProgress':
						this.$emit('onVideoTakenProgress', data)
						break
					case 'video':
						this.$emit('onVideoTakenEnd', data)
						break
					case 'focusStart':
						this.$emit('onFocusStart', data)
						this.$emit('onAutoFocusStart', data)
						break
					case 'focusEnd':
						this.$emit('onFocusEnd', data)
						break
					case 'zoomChanged':
						this.$emit('onZoomChanged', data)
						break
					case 'cameraChange':
						this.$emit('onCameraChange', data)
						break
					case 'orientationChange':
						this.$emit('onOrientationChanged', data)
						break
					case 'takeError':
						this.$emit('onCameraTakenError', data)
						break
					case 'error':
						this.$emit('onCameraError', data)
						break
				}
			}, uniAppX)
			this.open()
		},
		open() {
			if (!this.openCameraIfPermitted()) {
				this.initCameraPermission()
			}
		},
		reopen() {
			ImaCameraManager.close()
			this.open()
		},
		close() {
			ImaCameraManager.close()
		},
		destroyCamera() {
			if (this.$el != null) {
				destroyCameraView()
			}
		},
		takePhoto() {
			this.photoSound()
			ImaCameraManager.takePhoto()
		},
		takePhotoSnapshot() {
			this.photoSound()
			ImaCameraManager.takePhotoSnapshot()
		},
		takeVideo(duration ?: Number) {
			const maxDurationMs = duration != null ? duration.toInt() : 0
			if (maxDurationMs > 0) {
				startRecordingWithDuration(maxDurationMs)
			} else {
				ImaCameraManager.startRecording(null, null, false, 0)
			}
		},
		takeVideoSnapshot(duration ?: Number) {
			const maxDurationMs = duration != null ? duration.toInt() : 0
			if (maxDurationMs > 0) {
				startRecordingWithDuration(maxDurationMs)
			} else {
				ImaCameraManager.startRecording(null, null, false, 0)
			}
		},
		stopVideo() {
			ImaCameraManager.stopRecording()
		},
		changeZoom(zoom : Number) {
			let value = zoom.toFloat()
			if (value < 0) {
				value = (0).toFloat()
			}
			if (value > 1) {
				value = (1).toFloat()
			}
			this.linearZoomValue = value
			ImaCameraManager.setLinearZoom(this.linearZoomValue.toFloat())
		},
		setCameraZoom(ratio : any) {
			const zoomText = `${ratio}`.trim()
			const value = parseFloat(zoomText)
			if (value != value) {
				return
			}
			applyCameraZoom(value.toFloat())
		},
		changeWideAngle() {
			ImaCameraManager.switchToUltraWide()
		},
		changeZoomNormal() {
			applyCameraZoom((1.0).toFloat())
		},
		changeExposure(exposure : Number) {
			this.exposureValue = exposure.toFloat()
			ImaCameraManager.setExposureCompensation(this.exposureValue.toFloat())
		},
		changeWhiteBalance(whiteBalance : String) {
			ImaCameraManager.setWhiteBalance(whiteBalance)
		},
		changeHdr(hdr : String) {
			ImaCameraManager.setHdr(hdr)
		},
		changeFacing(facing : String) {
			this.cameraFacing = facing
			ImaCameraManager.setFacing(facing)
		},
		changeMode(_mode : String) {
		},
		changeGrid(grid : String, color : String) {
			const safeColor = color ?? this.gridColor ?? '#808080'
			ImaCameraManager.setGrid(grid, safeColor)
		},
		changeFlash(flash : String) {
			ImaCameraManager.setFlashMode(flash)
		},
		changeAudio(audio : String) {
			ImaCameraManager.setAudio(audio)
		},
		changeSuffix(suffix : String) {
			ImaCameraManager.setSuffix(suffix)
		},
		changePhotoResolution(resolution : String) {
			ImaCameraManager.setPhotoResolution(resolution ?? 'medium')
		},
		changeGallery(gallery : Boolean) {
			this.saveToGallery = gallery
			ImaCameraManager.setGallery(gallery)
		},
		changePinchZoom(enabled : Boolean) {
			ImaCameraManager.setPinchZoomEnabled(enabled)
		},
		changeTapToFocus(enabled : Boolean) {
			ImaCameraManager.setTapToFocusEnabled(enabled)
		},
		changeOrientation(orientation : String) {
			ImaCameraManager.setOrientation(orientation)
		},
		changePreviewRotation(degrees : Number) {
			ImaCameraManager.setPreviewRotation(degrees.toFloat())
		},
		changeSizeSelectors(width : any, height ?: Number, tolerance ?: Number) {
			let safeWidth = 0
			let safeHeight = 0
			let safeTolerance = 0.1
			if (height == null) {
				try {
					const json = JSON.parse(JSON.stringify(width)) as UTSJSONObject
					const optionWidth = json['width']
					const optionHeight = json['height']
					const optionTolerance = json['tolerance']
					if (optionWidth != null) {
						safeWidth = parseInt(`${optionWidth}`)
					}
					if (optionHeight != null) {
						safeHeight = parseInt(`${optionHeight}`)
					}
					if (optionTolerance != null) {
						safeTolerance = parseFloat(`${optionTolerance}`)
					}
				} catch (_) {
				}
			} else {
				safeWidth = parseInt(`${width}`)
				safeHeight = height.toInt()
				if (tolerance != null) {
					safeTolerance = tolerance.toFloat()
				}
			}
			if (safeTolerance != safeTolerance) {
				safeTolerance = 0.1
			}
			if (safeWidth != safeWidth) {
				safeWidth = 0
			}
			if (safeHeight != safeHeight) {
				safeHeight = 0
			}
			ImaCameraManager.setTargetResolution(safeWidth.toInt(), safeHeight.toInt(), safeTolerance.toFloat())
		},
		changePreviewCorner(radius ?: Number, radiusRate ?: Number) {
			let safeRadius : Number = 0
			let safeRadiusRate : Number = 0
			if (radius != null) {
				safeRadius = radius
			}
			if (radiusRate != null) {
				safeRadiusRate = radiusRate
			}
			ImaCameraManager.setPreviewCorner(safeRadius.toFloat(), safeRadiusRate.toFloat())
		},
		openAppSettings() {
			ImaCameraPermission.openAppSettings()
		},
		isOpened() : Boolean {
			return ImaCameraManager.isOpened()
		},
		photoSound() {
			if (this.vibrate) {
				vibrateDevice(this.duration ?? 300)
			}
			if (this.shutter) {
				ImaCameraUtils.playShutterSound(this.sound != null && this.sound.length > 0 ? this.sound : null)
			}
		},
		shortcutListener() {
			if (!this.shortcut) {
				return
			}
			const opts = new ListenerOptions('base', true, 400, 500)
			ImaCameraManager.setKeyListener(
				opts,
				(action : String, code : Number, name : String) => {
					console.log(`按键事件: ${action} -> ${name} (${code})`)
					if ((code == 24 || code == 25 || code == 27) && action == 'up') {
						this.takePhoto()
					} else if (code == 168 && action == 'down') {
						this.cameraZoom = this.cameraZoom + 0.01
						if (this.cameraZoom >= 1) {
							this.cameraZoom = (1).toFloat()
						}
						this.changeZoom(this.cameraZoom)
					} else if (code == 169 && action == 'down') {
						this.cameraZoom = this.cameraZoom - 0.01
						if (this.cameraZoom <= 0) {
							this.cameraZoom = (0).toFloat()
						}
						this.changeZoom(this.cameraZoom)
					} else if (code == 119 && action == 'up') {
						this.cameraFacing = this.cameraFacing == 'front' ? 'back' : 'front'
						this.changeFacing(this.cameraFacing)
					}
				}
			)
		}
	},
	created() {},
	NVLoad() : FrameLayout {
		const previewLayout = this.initCameraView()
		previewLayout.setVisibility(this.cameraPermissionGranted && !this.permissionRequesting ? View.VISIBLE : View.GONE)
		return previewLayout
	},
	NVLoaded() {
		if (!this.cameraPermissionGranted && !this.permissionRequesting) {
			this.initCameraPermission()
		}
		UTSAndroid.onAppActivityPause(() => {
			if (this.isOpened()) {
				this.close()
			}
		})
		UTSAndroid.onAppActivityResume(() => {
			if (!this.isOpened()) {
				// 从系统设置返回后重新校验权限，已授权则回调内会打开相机
				this.initCameraPermission()
			}
		})
		if (this.shortcut) {
			this.shortcutListener()
		}
	},
	NVLayouted() {
		this.changePreviewCorner(this.previewCornerRadius, this.previewCornerRadiusRate)
		this.setPreviewVisible(this.cameraPermissionGranted && !this.permissionRequesting)
		if (!this.isOpened()) {
			this.open()
		}
	},
	NVUnloaded() {
		if (this.$el != null) {
			this.destroyCamera()
		}
		if (this.shortcut) {
			ImaCameraManager.destroyKeyListener()
		}
	},
	unmounted() {
		if (this.$el != null) {
			this.destroyCamera()
		}
		if (this.shortcut) {
			ImaCameraManager.destroyKeyListener()
		}
		UTSAndroid.offAppActivityPause()
		UTSAndroid.offAppActivityResume()
	}
}
</script>
