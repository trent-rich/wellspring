import { useState, useEffect } from 'react';
import { Shield, Users, RefreshCw, AlertCircle, UserPlus, Send, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { adminInviteUser } from '../lib/edgeFunctions';
import type { User } from '../types';

const AVAILABLE_ROLES = [
  { value: 'admin', label: 'Admin', description: 'Full access to all pages' },
  { value: 'sequencing', label: 'Sequencing Only', description: 'Access to Sequencing page only' },
  { value: 'geode', label: 'GEODE Only', description: 'Access to GEODE Reports only' },
];

export default function AdminPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('admin');
  const [inviting, setInviting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateUserRole = async (userId: string, newRole: string) => {
    setSaving(userId);
    setError(null);
    setSuccess(null);

    const { error: updateError } = await supabase
      .from('users')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) {
      setError(`Failed to update role: ${updateError.message}`);
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      const updatedUser = users.find((u) => u.id === userId);
      setSuccess(`Updated ${updatedUser?.full_name || updatedUser?.email} to ${newRole}`);
      setTimeout(() => setSuccess(null), 3000);
    }
    setSaving(null);
  };

  const inviteUser = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      // Get current user's JWT for Edge Function auth
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setError('Not authenticated. Please sign in again.');
        setInviting(false);
        return;
      }

      // Invite via Edge Function (service role key stays server-side)
      await adminInviteUser(
        inviteEmail.trim(),
        inviteRole,
        `${window.location.origin}`,
        accessToken
      );

      setSuccess(`Invite sent to ${inviteEmail} with ${inviteRole} role`);
      setInviteEmail('');
      setInviteRole('admin');
      setShowInvite(false);
      setTimeout(() => setSuccess(null), 5000);

      // Refresh user list
      await fetchUsers();
    } catch (err) {
      setError(`Invite failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setInviting(false);
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
            <p className="text-sm text-gray-500">Manage users and their access roles</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-watershed-600 text-white rounded-lg hover:bg-watershed-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite User
          </button>
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-watershed-600" />
            <h3 className="text-sm font-medium text-gray-900">Send Invite</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Send an email invitation with a pre-assigned role. They'll receive a link to sign in.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-watershed-500"
              onKeyDown={(e) => e.key === 'Enter' && inviteUser()}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-watershed-500"
            >
              {AVAILABLE_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            <button
              onClick={inviteUser}
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-watershed-600 text-white rounded-lg hover:bg-watershed-700 transition-colors disabled:opacity-50"
            >
              {inviting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send
            </button>
          </div>
        </div>
      )}

      {/* Role legend */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Available Roles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {AVAILABLE_ROLES.map((role) => (
            <div key={role.value} className="flex items-start gap-2">
              <span
                className={`inline-block mt-0.5 w-2.5 h-2.5 rounded-full ${
                  role.value === 'admin'
                    ? 'bg-purple-500'
                    : role.value === 'sequencing'
                    ? 'bg-blue-500'
                    : 'bg-amber-500'
                }`}
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{role.label}</p>
                <p className="text-xs text-gray-500">{role.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-medium text-gray-700">
            Users ({users.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No users found. Invite users or they'll appear after signing in.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-gray-600">
                      {u.full_name?.[0]?.toUpperCase() || u.email[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.full_name || 'No name'}
                      {u.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-purple-600 font-normal">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <select
                    value={u.role}
                    onChange={(e) => updateUserRole(u.id, e.target.value)}
                    disabled={saving === u.id || u.id === currentUser?.id}
                    className={`text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-watershed-500 ${
                      u.id === currentUser?.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    {AVAILABLE_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  {saving === u.id && (
                    <RefreshCw className="w-4 h-4 animate-spin text-watershed-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
