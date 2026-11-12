import React, { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Product } from '../types';
import { suggestProducts } from '../searchSuggestions';
import type { ProductSuggestion } from '../searchSuggestions';

interface ProductSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** Productos entre los que se sugiere (el que arma la lista decide cuáles entran). */
  products: readonly Product[];
  /** Se elige una sugerencia: recibe el texto completo del campo en el que coincidió. */
  onPick?: (text: string) => void;
  placeholder: string;
  ariaLabel: string;
  inputClassName: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Botones a la derecha del campo (borrar, atajo de teclado). */
  trailing?: React.ReactNode;
}

const FIELD_LABEL = { name: 'Nombre', sku: 'SKU', barcode: 'Código' } as const;

/** Lo escrito en claro y lo que falta en gris. */
const HighlightedText: React.FC<{ suggestion: ProductSuggestion }> = ({ suggestion }) => {
  const { text, matchStart, matchLength } = suggestion;
  return (
    <span className="truncate">
      <span className="text-text-muted">{text.slice(0, matchStart)}</span>
      <span className="text-text-primary font-semibold">{text.slice(matchStart, matchStart + matchLength)}</span>
      <span className="text-text-muted">{text.slice(matchStart + matchLength)}</span>
    </span>
  );
};

/** Campo de búsqueda de productos con sugerencias mientras se escribe (por nombre, SKU o código de barras). */
export const ProductSearchBox: React.FC<ProductSearchBoxProps> = ({
  value, onChange, products, onPick, placeholder, ariaLabel, inputClassName, inputRef, trailing,
}) => {
  const listId = useId();
  const [isFocused, setIsFocused] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(() => suggestProducts(products, value), [products, value]);
  const isOpen = isFocused && suggestions.length > 0 && dismissedFor !== value;

  const pick = (suggestion: ProductSuggestion) => {
    onChange(suggestion.text);
    onPick?.(suggestion.text);
    setDismissedFor(suggestion.text);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setDismissedFor(value);
      setActiveIndex(-1);
      return;
    }
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) return setDismissedFor(null);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Recorre las sugerencias y una posición más (-1) que significa "ninguna", para volver a lo escrito
      const positions = suggestions.length + 1;
      setActiveIndex((index) => ((index + 1 + step + positions) % positions) - 1);
    } else if ((event.key === 'Enter' || event.key === 'Tab') && isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      pick(suggestions[activeIndex]);
    }
  };

  return (
    <div className="relative flex-1 w-full">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => { onChange(event.target.value); setDismissedFor(null); setActiveIndex(-1); }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => { setIsFocused(false); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
      />
      {trailing}
      {isOpen && (
        <ul id={listId} role="listbox" aria-label="Sugerencias de productos"
          className="absolute z-40 left-0 right-0 top-full mt-1 py-1 rounded-xl bg-surface border border-border shadow-xl overflow-hidden">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.product.id}-${suggestion.field}`} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}
              // mousedown (no click) para elegir antes de que el campo pierda el foco
              onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`px-3 py-2 flex items-center justify-between gap-3 text-xs cursor-pointer ${index === activeIndex ? 'bg-surface-2' : ''}`}>
              <HighlightedText suggestion={suggestion} />
              <span className="shrink-0 text-[10px] text-text-muted truncate max-w-[50%]">
                {suggestion.field === 'name'
                  ? (suggestion.product.sku ? `SKU ${suggestion.product.sku}` : '')
                  : `${FIELD_LABEL[suggestion.field]} · ${suggestion.product.name}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
