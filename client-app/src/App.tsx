import ClientDashboard from './components/ClientDashboard';
import { PWAInstallBanner, OfflineIndicator } from './components/PWAInstallBanner';
import { Toaster } from './components/ui/sonner';

function App() {
  const handleSwitchToMaster = () => {
    const masterUrl = (import.meta as any).env?.VITE_MASTER_URL || 'https://bmsjib5-ux.github.io/MonitorApp/';
    window.open(masterUrl, '_blank');
  };

  return (
    <>
      <OfflineIndicator />
      <ClientDashboard onSwitchToMaster={handleSwitchToMaster} />
      <PWAInstallBanner />
      <Toaster />
    </>
  );
}

export default App;
