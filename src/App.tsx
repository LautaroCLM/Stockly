import React from 'react';
import { AuthProvider } from '@/features/auth/hooks/useAuth';
import { CompanyProvider } from '@/features/companies/hooks/useCompany';
import { AppAuthShell } from '@/routes/AppAuthShell';
import { MotionProvider } from '@/lib/motion';

/** Raíz de la app: sesión, empresa activa y la pantalla que corresponda. */
export const App: React.FC = () => (
  <MotionProvider>
    <AuthProvider>
      <CompanyProvider>
        <AppAuthShell />
      </CompanyProvider>
    </AuthProvider>
  </MotionProvider>
);

export default App;
