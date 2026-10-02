"use client";

import { Button, Input, Label, Textarea } from "@shared/ui";

/** Editable list of short text entries (facts, prohibited claims, domains). */
export function ListEditor({
  id,
  label,
  hint,
  items,
  onChange,
  placeholder,
  addLabel,
  maxItems,
  multiline = false,
  disabled = false,
  errors,
}: {
  id: string;
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
  maxItems: number;
  multiline?: boolean;
  disabled?: boolean;
  errors?: Record<string, string>;
}) {
  const update = (index: number, value: string) => onChange(items.map((item, i) => (i === index ? value : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      <Label htmlFor={`${id}-0`} className="block text-sm font-medium text-foreground">
        {label}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errors?.[id] && <p className="text-xs text-danger">{errors[id]}</p>}
      <ul className="space-y-2">
        {items.map((item, index) => {
          const error = errors?.[`${id}.${index}`];
          return (
            <li key={index} className="space-y-1">
              <div className="flex items-start gap-2">
                {multiline ? (
                  <Textarea
                    id={`${id}-${index}`}
                    rows={2}
                    value={item}
                    placeholder={placeholder}
                    aria-label={`${label} ${index + 1}`}
                    aria-invalid={error ? true : undefined}
                    onChange={(event) => update(index, event.target.value)}
                  />
                ) : (
                  <Input
                    id={`${id}-${index}`}
                    value={item}
                    placeholder={placeholder}
                    aria-label={`${label} ${index + 1}`}
                    aria-invalid={error ? true : undefined}
                    onChange={(event) => update(index, event.target.value)}
                  />
                )}
                {!disabled && (
                  <Button variant="ghost" size="sm" onClick={() => remove(index)} aria-label={`Remove ${label} ${index + 1}`}>
                    Remove
                  </Button>
                )}
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
            </li>
          );
        })}
      </ul>
      {!disabled && items.length < maxItems && (
        <Button variant="secondary" size="sm" onClick={() => onChange([...items, ""])}>
          {addLabel}
        </Button>
      )}
    </fieldset>
  );
}
