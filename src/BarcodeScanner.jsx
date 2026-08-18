import { useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader } from "@zxing/browser"
import { DecodeHintType, BarcodeFormat } from "@zxing/library"

const hints = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.ITF,
    BarcodeFormat.DATA_MATRIX
  ]]
])

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const [error, setError] = useState("")
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let active = true
    let controls

    Promise.resolve()
      .then(() => {
        // bail if cleanup already ran (e.g. React StrictMode's dev-only double-invoke) —
        // otherwise two overlapping camera streams race to attach to the same <video>
        if (!active) return null
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera isn't available here — this needs HTTPS (or localhost) to access the camera")
        }
        return new BrowserMultiFormatReader(hints).decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && active) {
            active = false
            controls?.stop()
            onDetectedRef.current(result.getText())
          }
          // decode errors fire continuously while no barcode is in frame — not real errors, ignore
        })
      })
      .then((c) => {
        if (!c) return
        controls = c
        if (!active) controls.stop() // unmounted while the camera was still starting up
      })
      .catch((e) => setError(e?.message || "Couldn't access the camera"))

    return () => { active = false; controls?.stop() }
  }, [])

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <video ref={videoRef} className="flex-1 object-cover" muted playsInline />
      <button onClick={onClose} className="bg-white py-4 font-semibold">Cancel</button>
      {error && <p className="text-red-400 text-center p-2 text-sm">{error}</p>}
    </div>
  )
}