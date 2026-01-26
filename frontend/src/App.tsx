import { useState, useEffect } from 'react';
import ModeSelector from './components/ModeSelector';
import ClientDashboard from './components/ClientDashboard';
import MasterDashboard from './components/MasterDashboard';
import MasterLogin from './components/MasterLogin';

type AppMode = 'selector' | 'client' | 'master-login' | 'master';

function App() {
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
      // Session expired, clear it
      sessionStorage.removeItem('masterAuth');
      sessionStorage.removeItem('masterAuthTime');
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
    setMode('master-login');
  };

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
}

export default App;
