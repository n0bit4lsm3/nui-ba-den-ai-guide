import { useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';

import SkyScene from './SkyScene';
import SupportSheet from './SupportSheet';

// App shell: animated sky, the page, and a small floating support button.
export default function AppFrame({ step, children }) {
  const [supportOpen, setSupportOpen] = useState(false);

  // Pages without their own support button (e.g. the home menu) ask for the sheet this way.
  useEffect(() => {
    const open = () => setSupportOpen(true);
    window.addEventListener('nbd:support', open);
    return () => window.removeEventListener('nbd:support', open);
  }, []);

  return (
    <div className="app-shell">
      <SkyScene />

      <main className="app-main">{children}</main>

      {!['chatbot', 'landing', 'video'].includes(step) && (
        <button aria-label="Hỗ trợ" className="support-fab" onClick={() => setSupportOpen(true)} type="button">
          <PhoneCall size={16} />
          <span>Hỗ trợ</span>
        </button>
      )}

      <SupportSheet onClose={() => setSupportOpen(false)} open={supportOpen} />
    </div>
  );
}
