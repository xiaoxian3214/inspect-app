<template>
	<view>
		<slot />
	</view>
</template>

<script lang="uts">
import { UIView } from 'UIKit'
import { ImaCameraManager } from 'ImaCameraManager'

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
	ImaCameraManager.startRecording(null, null, false, maxDurationMs.toInt())
}

function applyCameraZoom(ratio : number) {
	ImaCameraManager.setCameraZoom(ratio.toFloat())
}

function vibrateDevice(duration : number = 300) {
	ImaCameraManager.vibrate((duration ?? 300).toInt())
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
			exposureValue: 0
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
		applyPreviewReady(success : boolean, message : string) {
			if (success) {
				this.changePreviewCorner(this.previewCornerRadius, this.previewCornerRadiusRate)
				this.changeGrid(this.grid, this.gridColor)
				this.changeWhiteBalance(this.whiteBalance)
				this.changeHdr(this.hdr)
				this.changeSuffix(this.photoSuffix)
				this.changeOrientation(this.orientation)
				this.changeAudio(this.audio)
				this.changeFacing(this.facing)
				this.changeFlash(this.flash)
				ImaCameraManager.setRecordSoundEnabled(this.recorder)
				ImaCameraManager.setRecordSoundFile(this.sound2 ?? '')
				ImaCameraManager.setPinchZoomEnabled(this.pinchZoom)
				ImaCameraManager.setTapToFocusEnabled(this.tapToFocus)
				this.initCamera()
			} else {
				console.warn(`相机初始化失败: ${message}`)
			}
		},
		initCameraView() : UIView {
			return ImaCameraManager.createPreviewView((success : boolean, message : string) => {
				this.applyPreviewReady(success, message)
			})
		},
		initCameraPermission() {
			ImaCameraManager.applyPermission((allRight : boolean, grantedList : Array<string>) => {
				if (allRight) {
					console.log(`相机权限已授予: ${grantedList}`)
					if (!this.isOpened()) {
						this.open()
					}
				} else {
					console.warn(`部分权限被拒绝: ${grantedList}`)
				}
			}, (doNotAskAgain : boolean, grantedList : Array<string>) => {
				if (doNotAskAgain) {
					ImaCameraManager.openAppSettings()
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
			ImaCameraManager.open()
		},
		open() {
			ImaCameraManager.open()
		},
		reopen() {
			ImaCameraManager.close()
			ImaCameraManager.open()
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
		changeSizeSelectors(width : Number, height : Number, tolerance : Number) {
			ImaCameraManager.setTargetResolution(width.toDouble(), height.toDouble(), tolerance.toDouble())
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
			ImaCameraManager.setPreviewCorner(safeRadius.toDouble(), safeRadiusRate.toDouble())
		},
		openAppSettings() {
			ImaCameraManager.openAppSettings()
		},
		isOpened() : Boolean {
			return ImaCameraManager.isOpened()
		},
		photoSound() {
			if (this.vibrate) {
				vibrateDevice(this.duration ?? 300)
			}
			if (this.shutter) {
				const custom = this.sound != null && this.sound.length > 0 ? this.sound : ''
				ImaCameraManager.playShutterSound(custom)
			}
		},
		shortcutListener() {
			if (!this.shortcut) {
				return
			}
			console.warn('ima-camerax-view: iOS 暂不支持音量键/蓝牙自拍杆监听')
		}
	},
	created() {
		this.initCameraPermission()
	},
	NVLoad() : UIView {
		return this.initCameraView()
	},
	NVLoaded() {
		if (this.shortcut) {
			this.shortcutListener()
		}
	},
	NVLayouted() {
		this.changePreviewCorner(this.previewCornerRadius, this.previewCornerRadiusRate)
		if (!this.isOpened()) {
			this.open()
		}
	},
	NVUnloaded() {
		if (this.$el != null) {
			this.destroyCamera()
		}
	},
	unmounted() {
		if (this.$el != null) {
			this.destroyCamera()
		}
	}
}
</script>
