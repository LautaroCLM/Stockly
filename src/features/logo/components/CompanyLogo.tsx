import React from 'react';

interface CompanyLogoProps {
  logo: string | null;
  initials: string;
  name: string;
  /** Clases de tamaño del cuadro, por ejemplo "w-8 h-8". */
  className?: string;
}

/** Logo de la empresa; si no tiene, las iniciales sobre el cuadro de color de siempre. */
export const CompanyLogo: React.FC<CompanyLogoProps> = ({ logo, initials, name, className = 'w-8 h-8' }) =>
  logo ? (
    <img src={logo} alt={`Logo de ${name}`} className={`${className} object-contain rounded-md shrink-0`} />
  ) : (
    <div className={`${className} rounded-md bg-gradient-to-br from-primary/30 to-accent/30 border border-primary/30 flex items-center justify-center text-xs font-bold text-accent shadow-inner shrink-0`}>
      {initials}
    </div>
  );
