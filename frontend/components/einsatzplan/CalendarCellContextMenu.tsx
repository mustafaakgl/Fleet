export type CalendarCellContextMenuAction = 'urlaub' | 'krank' | 'sonstige' | 'delete' | 'change';

interface CalendarCellContextMenuProps {
  x: number;
  y: number;
  mode?: 'empty' | 'manual';
  onClose: () => void;
  onSelect: (action: CalendarCellContextMenuAction) => void;
}

const emptyMenuItems: Array<{
  id: CalendarCellContextMenuAction;
  label: string;
  dotClass: string;
}> = [
  { id: 'urlaub', label: 'Urlaub eintragen', dotClass: 'bg-emerald-500' },
  { id: 'krank', label: 'Krankenstand eintragen', dotClass: 'bg-red-500' },
  { id: 'sonstige', label: 'Sonstige Abwesenheit eintragen', dotClass: 'bg-blue-500' },
];

const manualMenuItems: Array<{
  id: CalendarCellContextMenuAction;
  label: string;
  dotClass: string;
}> = [
  { id: 'change', label: 'Status ändern', dotClass: 'bg-blue-500' },
  { id: 'delete', label: 'Eintrag löschen', dotClass: 'bg-red-500' },
];

export function CalendarCellContextMenu({
  x,
  y,
  mode = 'empty',
  onClose,
  onSelect,
}: CalendarCellContextMenuProps) {
  const menuItems = mode === 'manual' ? manualMenuItems : emptyMenuItems;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={onClose} />

      <div
        className="fixed z-50 w-64 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg"
        style={{ left: x, top: y }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
