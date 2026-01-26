import { Monitor, LayoutDashboard } from 'lucide-react';

interface ModeSelectorProps {
  onSelectMode: (mode: 'client' | 'master') => void;
}

function ModeSelector({ onSelectMode }: ModeSelectorProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Windows Application Monitor
          </h1>
          <p className="text-gray-300 text-lg">
            Select your mode to continue
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Client Mode */}
          <button
            onClick={() => onSelectMode('client')}
            className="group bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/20 hover:border-blue-400 transition-all duration-300 text-left"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-blue-500/20 rounded-xl group-hover:bg-blue-500/30 transition-colors">
                <Monitor className="w-10 h-10 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Client Mode</h2>
                <span className="text-blue-400 text-sm font-medium">Process Monitor</span>
              </div>
            </div>
            <p className="text-gray-300 mb-6">
              Monitor and manage processes on this machine. Add, remove, start, stop processes and view real-time metrics.
            </p>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                Add/Remove processes to monitor
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                View CPU, RAM, Disk, Network metrics
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                Start/Stop/Restart processes
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                Set alerts and thresholds
              </li>
            </ul>
            <div className="mt-6 flex items-center text-blue-400 font-medium">
              <span>Enter Client Mode</span>
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>

          {/* Master Mode */}
          <button
            onClick={() => onSelectMode('master')}
            className="group bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/20 hover:border-purple-400 transition-all duration-300 text-left"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-purple-500/20 rounded-xl group-hover:bg-purple-500/30 transition-colors">
                <LayoutDashboard className="w-10 h-10 text-purple-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Master Mode</h2>
                <span className="text-purple-400 text-sm font-medium">Admin Dashboard</span>
              </div>
            </div>
            <p className="text-gray-300 mb-6">
              View and monitor all processes from all hospitals/clients. Filter, analyze, and manage from a central dashboard.
            </p>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full"></span>
                View all hospitals/clients data
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full"></span>
                Filter by hospital, program, status
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full"></span>
                Real-time monitoring from Supabase
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full"></span>
                Analytics and reporting
              </li>
            </ul>
            <div className="mt-6 flex items-center text-purple-400 font-medium">
              <span>Enter Master Mode</span>
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        </div>

        <p className="text-center text-gray-500 mt-8 text-sm">
          You can switch between modes anytime using the mode switch button
        </p>
      </div>
    </div>
  );
}

export default ModeSelector;
