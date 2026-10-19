import React, { useId, useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';

export type DropdownOption = { value: string; label: string; lang?: string; disabled?: boolean };
export type DropdownProps = {
  value: string;
  onValueChange(value: string): void;
  options: readonly DropdownOption[];
  label: string;
  id?: string;
  disabled?: boolean;
  describedBy?: string;
  className?: string;
};

function Chevron({ up = false }: { up?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={up ? 'm5 12 5-5 5 5' : 'm5 8 5 5 5-5'} /></svg>;
}

/** A controlled choice field with shared keyboard, focus, and menu styling. */
export function Dropdown({ value, onValueChange, options, label, id, disabled, describedBy, className }: DropdownProps) {
  const generatedId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);
  const selected = options.find(option => option.value === value);

  function changeOpen(next: boolean) {
    // A body portal would sit beneath a native modal's top layer and be inert.
    if (next) setPortalContainer(trigger.current?.closest('dialog') ?? undefined);
    setOpen(next);
  }

  return <Select.Root value={value} onValueChange={onValueChange} disabled={disabled} open={open} onOpenChange={changeOpen}>
    <Select.Trigger ref={trigger} id={id ?? generatedId} className={`dropdown-trigger${className ? ` ${className}` : ''}`}
      aria-label={label} aria-describedby={describedBy}>
      <Select.Value><span className="dropdown-value" lang={selected?.lang}>{selected?.label ?? value}</span></Select.Value>
      <Select.Icon className="dropdown-chevron"><Chevron /></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={portalContainer}>
      <Select.Content className="dropdown-menu" position="popper" sideOffset={8} align="start" collisionPadding={12}
        collisionBoundary={portalContainer} onEscapeKeyDown={event => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }} onCloseAutoFocus={event => {
          event.preventDefault();
          trigger.current?.focus({ preventScroll: true });
        }}>
        <Select.ScrollUpButton className="dropdown-scroll"><Chevron up /></Select.ScrollUpButton>
        <Select.Viewport className="dropdown-viewport">
          {options.map(option => <Select.Item key={option.value} className="dropdown-item" value={option.value}
            textValue={option.label} disabled={option.disabled}>
            <Select.ItemText><span lang={option.lang}>{option.label}</span></Select.ItemText>
            <Select.ItemIndicator className="dropdown-selected"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m4 10 4 4 8-8" /></svg></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
        <Select.ScrollDownButton className="dropdown-scroll"><Chevron /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
