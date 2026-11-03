import { Check } from 'lucide-react';

export default function ThankYouPage({ onRestart }) {
  return (
    <div className="phone">
      <div className="page thankyou-page">
        <div className="success-icon" aria-hidden="true">
          <Check strokeWidth={3} />
        </div>

        <h2>Cảm ơn bạn</h2>
        <p className="small-text">
          Chúc bạn có chuyến đi Núi Bà Đen thật vui. Quét mã QR ở điểm tiếp theo để hỏi tiếp.
        </p>

        <button className="primary-btn" onClick={onRestart}>
          Về màn hình quét QR
        </button>
      </div>
    </div>
  );
}
