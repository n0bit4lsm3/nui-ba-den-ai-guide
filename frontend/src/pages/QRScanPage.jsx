import { QRCodeSVG } from 'qrcode.react';

import { PUBLIC_APP_URL } from '../api';
import MascotHello from '../components/MascotHello';

const DEMO_QR_CODE = 'ECO_NUI_BA_DEN_001';
const DEMO_QR_TARGET_URL = `${PUBLIC_APP_URL}/?qr=${encodeURIComponent(DEMO_QR_CODE)}`;

export default function QRScanPage() {
  return (
    <div className="phone">
      <main className="page qr-start-page">
        <div className="topbar">
          <div>
            <div className="badge">AI Guide Núi Bà Đen</div>
            <h2>Bắt đầu hành trình</h2>
            <p className="small-text">
              Mở camera điện thoại, quét mã QR đặt tại điểm tham quan để gặp hướng dẫn viên AI của điểm đó.
            </p>
          </div>

          <MascotHello size={96} />
        </div>

        <div className="qr-frame">
          <div className="qr-code">
            <QRCodeSVG level="M" size={180} value={DEMO_QR_TARGET_URL} />
          </div>
          <span>Mã QR mẫu, quét để thử</span>
        </div>
      </main>
    </div>
  );
}
