import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeleteAccountDialog } from '@/components/auth/DeleteAccountDialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import * as Sentry from '@sentry/react';
import { useProfile, useUpdateProfile } from '@/services/profileService';
import { AvatarUpdateDialog } from '@/components/auth/AvatarUpdateDialog';

export default function SettingsView() {
  const { user, resetPassword } = useAuth();
  const { data: profile } = useProfile();
  const { mutate: updateProfile, isPending: isUpdateLoading } =
    useUpdateProfile();
  const { toast } = useToast();
  const [newName, setNewName] = useState(profile?.full_name || '');
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
    }
  }, [editingName]);

  useEffect(() => {
    setNewName(profile?.full_name || '');
  }, [profile?.full_name]);

  const handleUpdateName = () => {
    updateProfile(
      { full_name: newName },
      {
        onSuccess: () => {
          setEditingName(false);
          setNewName(profile?.full_name || '');
          toast({
            title: 'Success',
            description: 'Your name has been updated',
          });
        },
        onError: (e) => {
          Sentry.captureException(e);
          toast({
            title: 'Error',
            description: 'Failed to update name',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleUpdateNotifications = async (notificationsEnabled: boolean) => {
    updateProfile(
      {
        notifications_enabled: notificationsEnabled,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Success',
            description: 'Your notification preferences have been updated',
          });
        },
        onError: (e) => {
          Sentry.captureException(e);
          toast({
            title: 'Error',
            description: 'Failed to update notification preferences',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleCopyUserId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      toast({
        title: 'Copied!',
        description: 'User ID copied to clipboard',
      });
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-adam-bg-primary">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <div className="mb-8 flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-adam-text-primary">Settings</h1>
          <p className="text-sm text-adam-text-secondary">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-6">
          <section className="flex flex-col gap-4 rounded-lg bg-adam-bg-secondary p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-adam-text-primary">
                  Profile
                </h2>
                <p className="text-sm text-adam-text-secondary">
                  Update your profile information
                </p>
              </div>
              <AvatarUpdateDialog />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-adam-text-primary">
                  Name
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    {editingName ? (
                      <Input
                        ref={nameInputRef}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleUpdateName();
                          }
                        }}
                        className="pr-20"
                      />
                    ) : (
                      <Input
                        value={profile?.full_name || ''}
                        disabled
                        className="pr-20"
                      />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute right-1 top-1 h-7 px-2 text-xs"
                      onClick={() => {
                        if (editingName) {
                          handleUpdateName();
                        } else {
                          setEditingName(true);
                        }
                      }}
                      disabled={isUpdateLoading}
                    >
                      {isUpdateLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : editingName ? (
                        'Save'
                      ) : (
                        'Edit'
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-adam-text-primary">
                  Email
                </label>
                <Input value={user?.email || ''} disabled />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-adam-text-primary">
                  User ID
                </label>
                <div className="flex gap-2">
                  <Input
                    value={user?.id || ''}
                    disabled
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyUserId}
                    className="shrink-0"
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-lg bg-adam-bg-secondary p-6">
            <div>
              <h2 className="text-lg font-semibold text-adam-text-primary">
                Notifications
              </h2>
              <p className="text-sm text-adam-text-secondary">
                Manage your notification preferences
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-adam-text-primary">
                  Email Notifications
                </p>
                <p className="text-xs text-adam-text-secondary">
                  Receive email notifications for important updates
                </p>
              </div>
              <Switch
                checked={profile?.notifications_enabled ?? true}
                onCheckedChange={handleUpdateNotifications}
              />
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-lg bg-adam-bg-secondary p-6">
            <div>
              <h2 className="text-lg font-semibold text-adam-text-primary">
                Security
              </h2>
              <p className="text-sm text-adam-text-secondary">
                Manage your security settings
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={() => resetPassword?.(user?.email || '')}
                className="w-fit"
              >
                Reset Password
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-lg bg-adam-bg-secondary p-6">
            <div>
              <h2 className="text-lg font-semibold text-adam-text-primary">
                Danger Zone
              </h2>
              <p className="text-sm text-adam-text-secondary">
                Irreversible and destructive actions
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-adam-text-primary">
                  Delete Account
                </p>
                <p className="text-xs text-adam-text-secondary">
                  Permanently delete your account and all data
                </p>
              </div>
              <DeleteAccountDialog>
                <Button variant="ghost" className="h-8 text-sm text-red-500 hover:text-red-400 hover:bg-red-500/10">
                  Delete
                </Button>
              </DeleteAccountDialog>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
