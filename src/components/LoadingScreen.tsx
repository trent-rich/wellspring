import { Loader2, Command } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-watershed-50 to-white">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-watershed-500 to-watershed-700 mb-4 shadow-lg">
          <Command className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Wellspring</h2>
        <p className="text-sm text-gray-500 mt-1">Watershed Command Center</p>
        <div className="mt-4">
          <Loader2 className="w-6 h-6 text-watershed-600 animate-spin mx-auto" />
        </div>
      </div>
    </div>
  );
}
