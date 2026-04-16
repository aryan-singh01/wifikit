'use client';

import { useEffect, useMemo, useState } from 'react';
import { SenderView } from '@/components/SenderView';
import { ViewerView } from '@/components/ViewerView';

type TabId = 'landing' | 'sender' | 'viewer';

const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'wss://signal.railway.app';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>('landing');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role');
    if (role === 'sender' || role === 'viewer') {
      setActiveTab(role);
    }
  }, []);

  const tabs = useMemo(
    () => [
      { id: 'landing' as const, label: 'Home' },
      { id: 'sender' as const, label: 'Sender' },
      { id: 'viewer' as const, label: 'Viewer' },
    ],
    []
  );

  return (
    <div className="wk">
      <div className="wk-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`wk-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'landing' ? (
        <div className="wk-view active" id="tab-landing">
          <div className="topbar">
            <div className="brand">
              <div className="brand-icon">W</div>
              WifiKit
            </div>
            {/* <span className="topbar-url">{signalingUrl || 'wss://signal.railway.app'}</span> */}
          </div>

          <div className="landing">
            <div style={{ textAlign: 'center' }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                WebRTC · LAN · Real-time
              </div>
              <div className="landing-title">
                Wifi<span>Kit</span>
              </div>
              <div className="landing-sub" style={{ marginTop: 10 }}>
                Stream your phone camera to any device on the same network. Low-latency,
                peer-to-peer, no cloud.
              </div>
            </div>

            <div className="role-cards">
              <button className="role-card sender" type="button" onClick={() => setActiveTab('sender')}>
                <div className="role-icon">📱</div>
                <div className="role-name">Sender</div>
                <div className="role-desc">
                  Phone or camera device.
                  <br />
                  Captures and broadcasts video.
                </div>
                <span className="role-arrow">Open →</span>
              </button>
              <button className="role-card viewer" type="button" onClick={() => setActiveTab('viewer')}>
                <div className="role-icon">🖥️</div>
                <div className="role-name">Viewer</div>
                <div className="role-desc">
                  Laptop or desktop monitor.
                  <br />
                  Receives the live stream.
                </div>
                <span className="role-arrow">Open →</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'sender' ? (
        <div className="wk-view active" id="tab-sender">
          <div className="topbar">
            <div className="brand">
              <div className="brand-icon">W</div>
              WifiKit
            </div>
            {/* <span className="topbar-url">{signalingUrl || 'wss://signal.railway.app'}</span> */}
          </div>
          <SenderView signalingUrl={signalingUrl} onBack={() => setActiveTab('landing')} />
        </div>
      ) : null}

      {activeTab === 'viewer' ? (
        <div className="wk-view active" id="tab-viewer">
          <div className="topbar">
            <div className="brand">
              <div className="brand-icon">W</div>
              WifiKit
            </div>
            {/* <span className="topbar-url">{signalingUrl || 'wss://signal.railway.app'}</span> */}
          </div>
          <ViewerView signalingUrl={signalingUrl} onBack={() => setActiveTab('landing')} />
        </div>
      ) : null}
    </div>
  );
}
