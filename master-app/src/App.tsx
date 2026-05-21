import { useState } from 'react';
import MasterDashboard from './components/MasterDashboard';
import MasterLogin from './components/MasterLogin';
import GitHubPagesDashboard from './components/GitHubPagesDashboard';
import GitHubPagesLogin from './components/GitHubPagesLogin';
import { PWAInstallBanner, OfflineIndicator } from './components/PWAInstallBanner';
import { Toaster } from './components/ui/sonner';
import { isGitHubPages, isGitHubPagesAuthenticated, logoutGitHubPages } from './supabaseClient';

function GitHubPagesApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(isGitHubPagesAuthenticated());

  const handleLogin = () => setIsAuthenticated(true);
  const handleLogout = () => {
    logoutGitHubPages();
    setIsAuthenticated(false);
  };

  return (
    <>
      <OfflineIndicator />
      {isAuthenticated
        ? <GitHubPagesDashboard onLogout={handleLogout} />
        : <GitHubPagesLogin onLogin={handleLogin} />}
      <PWAInstallBanner />
      <Toaster />
    </>
  );
}

function LocalMasterApp() {
  const checkAuth = (): boolean => {
    const auth = sessionStorage.getItem('masterAuth');
    const authTime = sessionStorage.getItem('masterAuthTime');
    if (auth === 'true' && authTime) {
      const elapsed = Date.now() - parseInt(authTime);
      if (elapsed < 8 * 60 * 60 * 1000) return true;
      sessionStorage.removeItem('masterAuth');
      sessionStorage.removeItem('masterAuthTime');
      sessionStorage.removeItem('masterToken');
    }
    return false;
  };

  const [authed, setAuthed] = useState<boolean>(checkAuth());

  const handleLogin = () => setAuthed(true);
  const handleLogout = () => {
    sessionStorage.removeItem('masterAuth');
    sessionStorage.removeItem('masterAuthTime');
    sessionStorage.removeItem('masterToken');
    setAuthed(false);
  };
  const handleSwitchToClient = () => {
    const clientUrl = (import.meta as any).env?.VITE_CLIENT_URL || 'http://localhost:3001/';
    window.open(clientUrl, '_blank');
  };

  return (
    <>
      <OfflineIndicator />
      {authed
        ? <MasterDashboard onSwitchToClient={handleSwitchToClient} onLogout={handleLogout} />
        : <MasterLogin onLogin={handleLogin} onBack={handleLogout} />}
      <PWAInstallBanner />
      <Toaster />
    </>
  );
}

function App() {
  return isGitHubPages() ? <GitHubPagesApp /> : <LocalMasterApp />;
}

export default App;
