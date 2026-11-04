import React from 'react';
import { Plus, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface CustomersEmptyStateProps {
  /** La lista está vacía porque la carga falló. */
  hasLoadError: boolean;
  /** La empresa no tiene clientes (no es un filtro sin resultados). */
  isDirectoryEmpty: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onResetFilters: () => void;
}

/** Directorio vacío, búsqueda sin resultados o carga fallida. */
export const CustomersEmptyState: React.FC<CustomersEmptyStateProps> = ({ hasLoadError, isDirectoryEmpty, canCreate, onCreate, onResetFilters }) => (
  <Card className="border-border/60 bg-card/50">
    <CardContent className="p-12 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto mb-3">
        <Users className="w-6 h-6" />
      </div>
      {hasLoadError ? (
        <h3 className="text-sm font-semibold text-foreground">No se pudieron cargar los clientes</h3>
      ) : isDirectoryEmpty ? (
        <div>
          <h3 className="text-sm font-semibold text-foreground">No hay clientes registrados</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Comience agregando clientes a la empresa para asociarlos a ventas y presupuestos.
          </p>
          {canCreate && (
            <Button size="sm" onClick={onCreate} className="mt-4 text-xs gap-1.5">
              <Plus className="w-4 h-4" />
              <span>Registrar primer cliente</span>
            </Button>
          )}
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-foreground">Sin resultados</h3>
          <p className="text-xs text-muted-foreground mt-1">Ningún cliente coincide con los filtros aplicados.</p>
          <Button variant="outline" size="sm" onClick={onResetFilters} className="mt-3 text-xs">Restablecer filtros</Button>
        </div>
      )}
    </CardContent>
  </Card>
);
