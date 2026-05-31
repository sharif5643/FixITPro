// BarcodeDetector Web API — available in Chrome 84+ / Android WebView 84+
// https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector

interface BarcodeDetectorOptions {
  formats?: string[]
}

interface DetectedBarcode {
  rawValue: string
  format: string
  boundingBox: DOMRectReadOnly
  cornerPoints: ReadonlyArray<{ x: number; y: number }>
}

declare class BarcodeDetector {
  static getSupportedFormats(): Promise<string[]>
  constructor(options?: BarcodeDetectorOptions)
  detect(image: ImageBitmapSource | HTMLVideoElement): Promise<DetectedBarcode[]>
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector
}
