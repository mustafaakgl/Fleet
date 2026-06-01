'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Truck, Loader2 } from 'lucide-react';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { authApi } from '@/lib/api';
import { isAuthenticated, saveAuth, MOCK_CURRENT_USER } from '@/lib/auth';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setError(null);
    try {
      const email = data.email.trim().toLowerCase();
      const res = await authApi.signIn(email, data.password);
      const token = res.accessToken ?? res.access_token;
      if (!token) {
        setError('Login response did not include access token.');
        return;
      }
      saveAuth(token, {
        ...res.user,
        name: res.user.name ?? res.user.email,
      });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof AxiosError) {
        if (!err.response) {
          setError('Backend sunucusuna ulasilamiyor. Lutfen backend servisini baslatin.');
          return;
        }
        if (err.response.status === 401) {
          setError('Invalid email/password. Please try again.');
          return;
        }
      }
      setError('Giris sirasinda beklenmeyen bir hata olustu. Tekrar deneyin.');
    }
  }

  function handleDemoLogin() {
    saveAuth('dev-demo-token', { ...MOCK_CURRENT_USER, role: 'admin', name: 'Demo Admin' });
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg mb-4">
            <Truck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Fleet Management</h1>
          <p className="text-gray-500 text-sm mt-1">Admin Panel</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@fleet.com"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>

            <Button
              type="button"
              variant="outline"
              className="w-full mt-3"
              onClick={handleDemoLogin}
            >
              Demo giris (backend olmadan)
            </Button>

            <div className="mt-6 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 text-center mb-2">Test credentials</p>
              <div className="grid grid-cols-1 gap-2 text-xs text-gray-600">
                <div className="bg-gray-50 rounded-md px-2 py-1.5 text-center">
                  <p className="font-medium">Admin</p>
                  <p>admin@fleet.com</p>
                  <p className="text-gray-400">admin123</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
