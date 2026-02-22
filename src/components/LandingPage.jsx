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
      {/* Reassuring text: you're at the right site */}
      <div className="landing-headline">
        <h1 className="landing-title">United Nations Crisis Funding Dashboard</h1>
        <p className="landing-subtitle">You're in the right place — identifying the most underfunded crises worldwide.</p>
      </div>

      {/* Center: UN logo with landing-1..8 images standing around it, floating up and down */}
      <div className="landing-center">
        <div className="landing-logo-wrap">
          <div className="landing-orbit-wrap">
            {(() => {
              const n = 8;
              const radius = 170;
              return Array.from({ length: n }, (_, i) => {
                const angle = (i * 360 / n) * (Math.PI / 180);
                const tx = Math.round(radius * Math.cos(angle));
                const ty = Math.round(radius * Math.sin(angle));
                return (
                  <div
                    key={i}
                    className="landing-float-img"
                    style={{
                      '--landing-tx': `${tx}px`,
                      '--landing-ty': `${ty}px`,
                      '--float-delay': `${i * 0.15}s`,
                    }}
                  >
                    <img
                      src={`/landing-${i + 1}.png`}
                      alt=""
                      className="landing-float-img-inner"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                );
              });
            })()}
          </div>
          <img
            src="/un-logo.png"
            alt="United Nations"
            className="landing-logo"
          />
        </div>
        <button
          type="button"
          className="landing-btn"
          onClick={() => setEntered(true)}
        >
          Explore crisis funding data
        </button>
      </div>
    </div>
  );
}
