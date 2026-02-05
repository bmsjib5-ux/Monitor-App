import { useState, useEffect } from 'react';
import ModeSelector from './components/ModeSelector';
import ClientDashboard from './components/ClientDashboard';
import MasterDashboard from './components/MasterDashboard';
import MasterLogin from './components/MasterLogin';
import GitHubPagesDashboard from './components/GitHubPagesDashboard';
import { PWAInstallBanner, OfflineIndicator } from './components/PWAInstallBanner';
import { isGitHubPages } from './supabaseClient';

type AppMode = 'selector' | 'client' | 'master-login' | 'master';

// Main app for local/Electron environment
function LocalApp() {
  const [mode, setMode] = useState<AppMode>('selector');

  // Check authentication status for master mode
  const checkMasterAuth = (): boolean => {
    const auth = sessionStorage.getItem('masterAuth');
    const authTime = sessionStorage.getItem('masterAuthTime');

    if (auth === 'true' && authTime) {
      // Session expires after 8 hours
      const elapsed = Date.now() - parseInt(authTime);
      const maxAge = 8 * 60 * 60 * 1000; // 8 hours
      if (elapsed < maxAge) {
        return true;
      }
      // Session expired, clear all auth data
      sessionStorage.removeItem('masterAuth');
      sessionStorage.removeItem('masterAuthTime');
      sessionStorage.removeItem('masterToken');
    }
    return false;
  };

  // Load saved mode from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('monitorAppMode');
    if (savedMode === 'client') {
      setMode('client');
    } else if (savedMode === 'master') {
      // Check if authenticated
      if (checkMasterAuth()) {
        setMode('master');
      } else {
        setMode('master-login');
      }
    }
  }, []);

  const handleSelectMode = (selectedMode: 'client' | 'master') => {
    localStorage.setItem('monitorAppMode', selectedMode);
    if (selectedMode === 'master') {
      // Check if already authenticated
      if (checkMasterAuth()) {
        setMode('master');
      } else {
        setMode('master-login');
      }
    } else {
      setMode(selectedMode);
    }
  };

  const handleMasterLogin = () => {
    setMode('master');
  };

  const handleBackToSelector = () => {
    localStorage.removeItem('monitorAppMode');
    setMode('selector');
  };

  const handleSwitchToMaster = () => {
    localStorage.setItem('monitorAppMode', 'master');
    if (checkMasterAuth()) {
      setMode('master');
    } else {
      setMode('master-login');
    }
  };

  const handleSwitchToClient = () => {
    localStorage.setItem('monitorAppMode', 'client');
    setMode('client');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('masterAuth');
    sessionStorage.removeItem('masterAuthTime');
    sessionStorage.removeItem('masterToken');
    setMode('master-login');
  };

  const renderContent = () => {
    if (mode === 'selector') {
      return <ModeSelector onSelectMode={handleSelectMode} />;
    }

    if (mode === 'master-login') {
      return <MasterLogin onLogin={handleMasterLogin} onBack={handleBackToSelector} />;
    }

    if (mode === 'master') {
      return <MasterDashboard onSwitchToClient={handleSwitchToClient} onLogout={handleLogout} />;
    }

    return <ClientDashboard onSwitchToMaster={handleSwitchToMaster} />;
  };

  return (
    <>
      <OfflineIndicator />
      {renderContent()}
      <PWAInstallBanner />
    </>
  );
}

// Root App component - switches between GitHub Pages and Local mode
function App() {
  // Check if running on GitHub Pages - show read-only dashboard
  const onGitHubPages = isGitHubPages();

  if (onGitHubPages) {
    return (
      <>
        <OfflineIndicator />
        <GitHubPagesDashboard />
        <PWAInstallBanner />
      </>
    );
  }

  return <LocalApp />;
}

export default App;
