import { ScanLine } from "lucide-react";
import { Header } from "../components/chrome";
export default function Live() {
  return (
    <div className="site">
      <Header />
      <main className="narrow" id="content">
        <div className="square-icon">
          <ScanLine />
        </div>
        <h1>Scan your table code</h1>
        <p className="lede">
          Use the QR code printed at your table to open the restaurant menu. If
          your code led here, ask a member of staff for a current code.
        </p>
      </main>
    </div>
  );
}
