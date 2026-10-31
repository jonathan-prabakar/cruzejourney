"use client";
import { useId, useState } from 'react';
import { MapPin } from 'lucide-react';
import { curatedRouteProvider } from '@/lib/journey/routes';
export interface LocationSelection { id: string; text: string }
export default function LocationField({ label, value, onChange }: {
  label: string; value: LocationSelection; onChange(value: LocationSelection): void;
}) {
  const id = useId(), [open, setOpen] = useState(false);
  const suggestions = curatedRouteProvider.search(value.text);
  return <div className="jp-location" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>{label}</label>
    <div className="jp-input-wrap"><MapPin size={15}/><input id={id} role="combobox" autoComplete="off"
      aria-expanded={open} aria-controls={id + '-options'} aria-autocomplete="list"
      value={value.text} placeholder="Search demo cities" onFocus={() => setOpen(true)}
      onChange={e => { onChange({ id: '', text: e.target.value }); setOpen(true); }}
      onKeyDown={e => {
        if (e.key === 'Escape') setOpen(false);
        if (e.key === 'Enter' && suggestions.length === 1) { e.preventDefault(); onChange({ id: suggestions[0].id, text: suggestions[0].name }); setOpen(false); }
      }}/></div>
    {open && <div id={id + '-options'} role="listbox" className="jp-suggestions" aria-label={label + ' suggestions'}>
      {suggestions.length ? suggestions.map(location => <button key={location.id} type="button" role="option"
        aria-selected={location.id === value.id} onClick={() => { onChange({ id: location.id, text: location.name }); setOpen(false); }}>
        <strong>{location.name}</strong><small>{location.subtitle}</small>
      </button>) : <p>No supported city found. Select a curated Texas location; arbitrary addresses are not resolved.</p>}
    </div>}
  </div>;
}
