import { useState } from 'react';
import Aurora from './Aurora';
import CrisisDashboard from './CrisisDashboard';

export default function LandingPage() {
  const [entered, setEntered] = useState(false);

  if (entered) {
    return <CrisisDashboard data={null} />;
  }

  return (
    <div className="landing-page">
      {/* Top aurora - full screen */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <Aurora
          colorStops={['#009dff', '#5dbdf9', '#ffffff']}
          blend={0.5}
          amplitude={1.0}
          speed={1}
        />
      </div>
      {/* Bottom aurora - flipped */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          width: '100%',
        }}
      >
        <div style={{ width: '100%', height: '100%', transform: 'scaleY(-1)' }}>
          <Aurora
            colorStops={['#009dff', '#5dbdf9', '#ffffff']}
            blend={0.5}
            amplitude={1.0}
            speed={1}
          />
        </div>
      </div>
      {/* Center: UN logo + button - no FadeContent so always visible */}
      <div className="landing-center">
        <img
          src="/un-logo.png"
          alt="United Nations"
          className="landing-logo"
        />
        <button
          type="button"
          className="landing-btn"
          onClick={() => setEntered(true)}
        >
          Enter dashboard
        </button>
      </div>
    </div>
  );
}
