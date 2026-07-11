import { useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader } from "@zxing/browser"

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let active = true

    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (result && active) {
        active = false
        onDetected(result.getText())
      }
      // decode errors fire continuously while no barcode is in frame — not real errors, ignore
    }).catch(() => setError("Couldn't access the camera"))

    return () => { active = false; reader.reset() }
  }, [onDetected])

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <video ref={videoRef} className="flex-1 object-cover" muted playsInline />
      <button onClick={onClose} className="bg-white py-4 font-semibold">Cancel</button>
      {error && <p className="text-red-400 text-center p-2 text-sm">{error}</p>}
    </div>
  )
}