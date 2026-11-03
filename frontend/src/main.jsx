import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import './style.css';
import AppFrame from './components/AppFrame';
import ChatbotPage from './pages/ChatbotPage';
import ItineraryPage from './pages/ItineraryPage';
import LandingPage from './pages/LandingPage';
import ThankYouPage from './pages/ThankYouPage';
import VideoPage from './pages/VideoPage';
import { API_URL } from './api';

// Each step has its own path so it can be opened, refreshed and shared directly.
// The selected destination travels in `?dest=<id>`. The intro video is the
// home page; a QR code printed on site opens `/?qr=<code>` (or `/<code>`).
const STEP_PATHS = {
  video: '/',
  landing: '/landing',
  itinerary: '/itinerary',
  chatbot: '/chatbot',
  thankyou: '/thankyou',
};
const PATH_STEPS = { ...Object.fromEntries(Object.entries(STEP_PATHS).map(([step, path]) => [path, step])), '/video': 'video' };

function readLocation() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const step = PATH_STEPS[path];
  // Any other path is treated as a QR code, e.g. /ECO_NUI_BA_DEN_001.
  const qrCode = params.get('qr') || (step ? '' : decodeURIComponent(path.slice(1)));
  const destId = Number(params.get('dest')) || null;
  return { step: step || 'video', qrCode, destId };
}

function urlFor(step, destination) {
  const path = STEP_PATHS[step] || '/';
  return destination?.id ? `${path}?dest=${destination.id}` : path;
}

function App() {
  const initial = readLocation();
  const [step, setStep] = useState(initial.step);
  const [destination, setDestination] = useState(null);
  // Question handed to the chatbot by the itinerary planner.
  const [pendingQuestion, setPendingQuestion] = useState(null);

  function go(nextStep, nextDestination = destination, { replace = false } = {}) {
    setStep(nextStep);
    setDestination(nextDestination || null);
    const url = urlFor(nextStep, nextDestination);
    if (replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
  }

  async function loadDestination(destId) {
    if (!destId) return null;
    try {
      const res = await fetch(`${API_URL}/api/destinations/${destId}`);
      const data = await res.json();
      return data && data.id ? data : null;
    } catch (e) {
      return null;
    }
  }

  useEffect(() => {
    async function init() {
      if (initial.qrCode) {
        try {
          const res = await fetch(`${API_URL}/api/qr/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_code: initial.qrCode }),
          });
          const data = await res.json();
          if (data.status === 'valid') {
            go('video', data.destination, { replace: true });
            return;
          }
        } catch (e) {}
        go('video', null, { replace: true });
        return;
      }

      setDestination(await loadDestination(initial.destId));
    }

    async function onPopState() {
      const loc = readLocation();
      setStep(loc.step);
      setDestination(await loadDestination(loc.destId));
    }

    init();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <AppFrame destination={destination} onGo={(next) => go(next, destination)} step={step}>
      {step === 'video' && (
        <VideoPage
          destination={destination}
          onNext={() => go('landing')}
        />
      )}

      {step === 'landing' && (
        <LandingPage
          destination={destination}
          onBack={() => go('video')}
          onNext={(data) => go('chatbot', data || destination)}
          onPlan={() => go('itinerary')}
        />
      )}

      {step === 'itinerary' && (
        <ItineraryPage
          onBack={() => go('landing')}
          onAsk={(question) => {
            setPendingQuestion(question);
            go('chatbot');
          }}
        />
      )}

      {step === 'chatbot' && (
        <ChatbotPage
          key={destination?.id || 'none'}
          destination={destination}
          initialQuestion={pendingQuestion}
          onInitialQuestionUsed={() => setPendingQuestion(null)}
          onBack={() => go('landing')}
          onDone={() => go('thankyou')}
        />
      )}

      {step === 'thankyou' && <ThankYouPage onRestart={() => go('video', null)} />}
    </AppFrame>
  );
}

createRoot(document.getElementById('root')).render(<App />);
