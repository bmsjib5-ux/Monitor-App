import ClientDashboard from './components/ClientDashboard';
import { PWAInstallBanner, OfflineIndicator } from './components/PWAInstallBanner';
import { Toaster } from './components/ui/sonner';

function App() {
  return (
    <>
      <OfflineIndicator />
      <ClientDashboard />
      <PWAInstallBanner />
      <Toaster />
    </>
  );
}

export default App;
