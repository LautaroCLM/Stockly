import React from 'react';
import { AuthProvider } from '@/features/auth/hooks/useAuth';
import { CompanyProvider } from '@/features/companies/hooks/useCompany';
import { AppAuthShell } from '@/routes/AppAuthShell';
import { MotionProvider } from '@/lib/motion';
import { PwaStatus } from '@/features/pwa/PwaStatus';
import { ToastProvider } from '@/components/feedback/ToastProvider';

/** Raíz de la app: sesión, empresa activa y la pantalla que corresponda. */
export const App: React.FC = () => (
  <MotionProvider>
    <ToastProvider>
      <AuthProvider>
        <CompanyProvider>
          <AppAuthShell />
          <PwaStatus />
        </CompanyProvider>
      </AuthProvider>
    </ToastProvider>
  </MotionProvider>
);

export default App;
