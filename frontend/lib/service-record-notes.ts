function readField(notes: string | undefined, key: string): string | null {
  if (!notes?.trim()) return null;
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'im');
  const match = notes.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export function parseServiceRecordLabels(notes?: string): string[] {
  const raw = readField(notes, 'Labels');
  if (!raw) return [];
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

export function parseServiceRecordIssues(notes?: string): string {
  return readField(notes, 'Linked issues') ?? '';
}

export function parseServiceRecordReference(notes?: string): string {
  return readField(notes, 'Reference') ?? '';
}

export function parseServiceRecordSummary(notes?: string): string {
  const reference = readField(notes, 'Reference');
  if (reference) return reference;

  if (!notes?.trim()) return '';

  const blocks = notes.split('\n\n').map((block) => block.trim()).filter(Boolean);
  const structuredPrefixes = [
    'Reference:',
    'Labels:',
    'Start:',
    'Priority:',
    'Linked issues:',
    'Line items:',
  ];

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (structuredPrefixes.some((prefix) => block.startsWith(prefix))) continue;
    return block;
  }

  return '';
}

export function parseServiceRecordTasks(record: {
  service_type: string;
  notes?: string;
}): string[] {
  const notes = record.notes;
  if (notes?.includes('Line items:')) {
    const block = notes.split('Line items:')[1]?.split('\n\n')[0] ?? '';
    const tasks = block
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*/, '').replace(/\s*\(€[\d.,]+\)\s*$/i, '').trim())
      .filter(Boolean);
    if (tasks.length > 0) return tasks;
  }

  let type = record.service_type.trim();
  type = type
    .replace(/^Scheduled Maintenance\s*[—-]\s*/i, '')
    .replace(/^Emergency Repair\s*[—-]\s*/i, '');
  const parts = type.split(';').map((item) => item.trim()).filter(Boolean);
  return parts.length > 0 ? parts : type ? [type] : [];
}

export function formatServiceTasks(serviceType: string): { primary: string; extra: number } {
  const parts = serviceType
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { primary: parts[0] ?? serviceType, extra: 0 };
  }

  return { primary: parts[0], extra: parts.length - 1 };
}

export function hasServiceRecordAttachments(notes?: string): boolean {
  if (!notes?.trim()) return false;
  return /Attachments:|Line items:|Linked issues:|Reference:|Labels:/i.test(notes);
}
