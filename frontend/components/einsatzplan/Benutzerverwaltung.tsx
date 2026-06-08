'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, KeyRound, Mail, Pencil, Power, ShieldOff, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi, invitationsApi, privacyApi, usersApi } from '@/lib/api';
import { downloadBlob } from '@/lib/download-blob';
import { getUser } from '@/lib/auth';
import { isPasswordStrong } from '@/lib/password-policy';
import type { User, UserRole, UserStatus } from '@/lib/types';

type DrawerMode = 'create' | 'edit' | 'invite';

interface UserFormData {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  language: string;
}

const roleValues: UserRole[] = ['admin', 'boss', 'accounting', 'office', 'driver'];
const statusValues: UserStatus[] = ['active', 'inactive'];
const languageValues = ['de', 'en', 'tr'];

const emptyForm: UserFormData = {
  full_name: '',
  email: '',
  password: '',
  role: 'office',
  status: 'active',
  language: 'de',
};

function statusBadgeClass(status: UserStatus) {
  return status === 'active'
    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
    : 'border-rose-200 bg-rose-100 text-rose-700';
}

export function Benutzerverwaltung() {
  const { t } = useTranslation();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [gdprUserId, setGdprUserId] = useState<string | null>(null);

  const currentUserId = getUser()?.id;
  const isAdmin = getUser()?.role === 'admin';

  function isAnonymizedUser(user: User): boolean {
    return user.full_name === 'ANONYMIZED' && user.email.endsWith('@anonymized.local');
  }

  const roleLabel = useCallback((role: UserRole) => t(`usersAdmin.roles.${role}`), [t]);
  const languageLabel = useCallback(
    (language: string) => (languageValues.includes(language) ? t(`usersAdmin.languages.${language}`) : language),
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await usersApi.list({
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setUsers(res.data);
    } catch {
      setLoadError(t('usersAdmin.loadError'));
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.full_name.localeCompare(b.full_name, 'de')),
    [users],
  );

  function openCreateDrawer() {
    setDrawerMode('create');
    setEditingUserId(null);
    setFormData(emptyForm);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(user: User) {
    setDrawerMode('edit');
    setEditingUserId(user.id);
    setFormData({
      full_name: user.full_name,
      email: user.email,
      password: '',
      role: user.role,
      status: user.status,
      language: user.language || 'de',
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving) return;
    setDrawerOpen(false);
    setEditingUserId(null);
  }

  async function saveUser() {
    setFormError(null);

    if (!formData.full_name.trim() || !formData.email.trim()) {
      setFormError(t('usersAdmin.nameEmailRequired'));
      return;
    }
    if (drawerMode === 'create' && !isPasswordStrong(formData.password)) {
      setFormError(t('usersAdmin.passwordMin'));
      return;
    }
    if (drawerMode === 'edit' && formData.password && !isPasswordStrong(formData.password)) {
      setFormError(t('usersAdmin.passwordMin'));
      return;
    }

    setSaving(true);
    try {
      if (drawerMode === 'invite') {
        const result = await invitationsApi.create({
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          role: formData.role,
          language: formData.language,
        });
        const mailHint = result.mail_sent
          ? t('usersAdmin.inviteMailSent')
          : t('usersAdmin.inviteMailLogged', { mode: result.mail_mode });
        window.prompt(
          `${mailHint}\n\n${t('usersAdmin.inviteLinkCreated', { url: result.invite_url })}`,
          result.invite_url,
        );
      } else if (drawerMode === 'edit' && editingUserId) {
        await usersApi.update(editingUserId, {
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          role: formData.role,
          status: formData.status,
          language: formData.language,
          ...(formData.password ? { password: formData.password } : {}),
        });
      } else {
        await usersApi.create({
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          role: formData.role,
          status: formData.status,
          language: formData.language,
        });
      }
      setDrawerOpen(false);
      setEditingUserId(null);
      await load();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setFormError(
        Array.isArray(message) ? message.join(' ') : message || t('usersAdmin.saveError'),
      );
    } finally {
      setSaving(false);
    }
  }

  function openInviteDrawer() {
    setDrawerMode('invite');
    setEditingUserId(null);
    setFormData({ ...emptyForm, password: '' });
    setFormError(null);
    setDrawerOpen(true);
  }

  async function createResetLink(user: User) {
    try {
      const result = await authApi.requestPasswordReset(user.id);
      window.prompt(t('usersAdmin.resetLinkCreated', { url: result.reset_url }), result.reset_url);
    } catch {
      setLoadError(t('usersAdmin.resetLinkError'));
    }
  }

  async function handleGdprExport(user: User) {
    setGdprUserId(user.id);
    try {
      const blob = await privacyApi.exportUser(user.id);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `user-export-${user.id}-${stamp}.zip`);
    } catch {
      setLoadError(t('usersAdmin.gdprExportError'));
    } finally {
      setGdprUserId(null);
    }
  }

  async function handleGdprAnonymize(user: User) {
    if (!window.confirm(t('usersAdmin.gdprAnonymizeConfirm', { name: user.full_name }))) return;
    const reason = window.prompt(t('usersAdmin.gdprReasonPrompt'));
    if (!reason || reason.trim().length < 3) return;

    setGdprUserId(user.id);
    try {
      await privacyApi.anonymizeUser(user.id, reason.trim());
      window.alert(t('usersAdmin.gdprAnonymizeDone'));
      await load();
    } catch {
      setLoadError(t('usersAdmin.gdprAnonymizeError'));
    } finally {
      setGdprUserId(null);
    }
  }

  async function toggleStatus(user: User) {
    const nextStatus: UserStatus = user.status === 'active' ? 'inactive' : 'active';
    const confirmed =
      nextStatus === 'inactive'
        ? window.confirm(t('usersAdmin.confirmDeactivate', { name: user.full_name }))
        : true;
    if (!confirmed) return;

    try {
      if (nextStatus === 'inactive') {
        await usersApi.deactivate(user.id);
      } else {
        await usersApi.update(user.id, { status: 'active' });
      }
      await load();
    } catch {
      setLoadError(t('usersAdmin.statusError'));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('usersAdmin.title')}</h2>
        <p className="text-sm text-slate-600">{t('usersAdmin.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={openCreateDrawer}
          className="inline-flex items-center gap-2 rounded-md border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <UserPlus className="h-4 w-4" />
          {t('usersAdmin.create')}
        </button>
        <button
          type="button"
          onClick={openInviteDrawer}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Mail className="h-4 w-4" />
          {t('usersAdmin.invite')}
        </button>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('usersAdmin.searchPlaceholder')}
          className="h-9 w-56 rounded-md border border-slate-300 px-3 text-sm"
        />
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="h-9 rounded-md border border-slate-300 px-2 text-sm"
        >
          <option value="">{t('usersAdmin.allRoles')}</option>
          {roleValues.map((role) => (
            <option key={role} value={role}>{roleLabel(role)}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-slate-300 px-2 text-sm"
        >
          <option value="">{t('usersAdmin.allStatuses')}</option>
          <option value="active">{t('usersAdmin.statusActive')}</option>
          <option value="inactive">{t('usersAdmin.statusInactive')}</option>
        </select>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3">{t('usersAdmin.colName')}</th>
                <th className="border-b border-slate-200 px-4 py-3">{t('usersAdmin.colEmail')}</th>
                <th className="border-b border-slate-200 px-4 py-3">{t('usersAdmin.colRole')}</th>
                <th className="border-b border-slate-200 px-4 py-3">{t('usersAdmin.colLanguage')}</th>
                <th className="border-b border-slate-200 px-4 py-3">{t('usersAdmin.colStatus')}</th>
                <th className="border-b border-slate-200 px-4 py-3 text-right">{t('usersAdmin.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    {t('usersAdmin.loading')}
                  </td>
                </tr>
              )}

              {!loading && loadError && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-rose-600">
                    {loadError}
                  </td>
                </tr>
              )}

              {!loading && !loadError && sortedUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    {t('usersAdmin.empty')}
                  </td>
                </tr>
              )}

              {!loading && !loadError &&
                sortedUsers.map((user) => (
                  <tr key={user.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{user.full_name}</td>
                    <td className="px-4 py-2.5 text-slate-700">{user.email}</td>
                    <td className="px-4 py-2.5 text-slate-700">{roleLabel(user.role)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{languageLabel(user.language)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(user.status)}`}>
                        {user.status === 'active' ? t('usersAdmin.statusActive') : t('usersAdmin.statusInactive')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDrawer(user)}
                          className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                          aria-label={t('usersAdmin.editAction')}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleGdprExport(user)}
                              disabled={gdprUserId === user.id}
                              className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              aria-label={t('usersAdmin.gdprExportAction')}
                              title={t('usersAdmin.gdprExport')}
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleGdprAnonymize(user)}
                              disabled={
                                gdprUserId === user.id ||
                                isAnonymizedUser(user) ||
                                user.id === currentUserId
                              }
                              className="rounded border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              aria-label={t('usersAdmin.gdprAnonymizeAction')}
                              title={t('usersAdmin.gdprAnonymize')}
                            >
                              <ShieldOff className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                        {user.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => void createResetLink(user)}
                            className="rounded border border-amber-200 p-1.5 text-amber-700 hover:bg-amber-50"
                            aria-label={t('usersAdmin.resetPasswordAction')}
                            title={t('usersAdmin.resetPassword')}
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggleStatus(user)}
                          className={`rounded border p-1.5 ${
                            user.status === 'active'
                              ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                          }`}
                          aria-label={user.status === 'active' ? t('usersAdmin.deactivateAction') : t('usersAdmin.activateAction')}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/25" onClick={closeDrawer} />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                {drawerMode === 'create'
                  ? t('usersAdmin.createTitle')
                  : drawerMode === 'invite'
                    ? t('usersAdmin.inviteTitle')
                    : t('usersAdmin.editTitle')}
              </h3>
              <button type="button" onClick={closeDrawer} className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50" aria-label={t('usersAdmin.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">{t('usersAdmin.fieldName')}</span>
                <input value={formData.full_name} onChange={(event) => setFormData((current) => ({ ...current, full_name: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">{t('usersAdmin.fieldEmail')}</span>
                <input type="email" value={formData.email} onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3" />
              </label>
              {drawerMode !== 'invite' ? (
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-slate-600">
                    {drawerMode === 'create' ? t('usersAdmin.fieldPassword') : t('usersAdmin.fieldNewPassword')}
                  </span>
                  <input type="password" value={formData.password} onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))} placeholder={drawerMode === 'edit' ? t('usersAdmin.passwordKeepHint') : ''} className="h-10 w-full rounded-md border border-slate-300 px-3" />
                  <p className="text-xs text-slate-500">{t('auth.passwordPolicy.hint')}</p>
                </label>
              ) : (
                <p className="text-sm text-slate-600 md:col-span-2">{t('usersAdmin.inviteHint')}</p>
              )}
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">{t('usersAdmin.fieldRole')}</span>
                <select value={formData.role} onChange={(event) => setFormData((current) => ({ ...current, role: event.target.value as UserRole }))} className="h-10 w-full rounded-md border border-slate-300 px-3">
                  {roleValues.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">{t('usersAdmin.fieldLanguage')}</span>
                <select value={formData.language} onChange={(event) => setFormData((current) => ({ ...current, language: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3">
                  {languageValues.map((language) => <option key={language} value={language}>{languageLabel(language)}</option>)}
                </select>
              </label>
              {drawerMode !== 'invite' ? (
                <label className="space-y-1 text-sm">
                  <span className="text-slate-600">{t('usersAdmin.fieldStatus')}</span>
                  <select value={formData.status} onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value as UserStatus }))} className="h-10 w-full rounded-md border border-slate-300 px-3">
                    {statusValues.map((status) => (
                      <option key={status} value={status}>
                        {status === 'active' ? t('usersAdmin.statusActive') : t('usersAdmin.statusInactive')}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {formError && (
              <div className="mx-5 mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {formError}
              </div>
            )}

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button type="button" onClick={closeDrawer} disabled={saving} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {t('usersAdmin.cancel')}
              </button>
              <button type="button" onClick={saveUser} disabled={saving} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                {saving
                  ? t('usersAdmin.saving')
                  : drawerMode === 'invite'
                    ? t('usersAdmin.inviteSend')
                    : t('usersAdmin.save')}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
