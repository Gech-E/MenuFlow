"use client";
import { useRef, useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Printer } from "lucide-react";
export function TableCode({
  locator,
  label,
  restaurant,
}: {
  locator: string;
  label: string;
  restaurant: string;
}) {
  const qr = useRef<HTMLDivElement>(null),
    [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(location.origin + "/t/" + encodeURIComponent(locator));
  }, [locator]);
  function download() {
    const svg = qr.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "menuflow-" + label.replace(/[^a-z0-9]/gi, "-") + ".svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }
  return (
    <div className="stack">
      <div className="qr-print print-target" ref={qr}>
        <p className="eyebrow">{restaurant}</p>
        <h2>{label}</h2>
        {url && <QRCodeSVG value={url} size={196} marginSize={4} />}
        <p>Scan to view the menu</p>
      </div>
      <div className="actions no-print">
        <button className="btn" onClick={download}>
          <Download size={15} />
          Download SVG
        </button>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} />
          Print
        </button>
        <a href={url} target="_blank" rel="noreferrer">
          Open table menu
        </a>
      </div>
    </div>
  );
}
