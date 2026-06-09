type ExportConversationRow = {
  driverName: string;
  employeeNumber: string;
  department: string;
  subject: string;
  lastMessageAt: string;
  unreadCount: number;
  lastMessagePreview: string;
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildMessengerConversationsCsv(rows: ExportConversationRow[]): string {
  const headers = [
    'driver_name',
    'employee_number',
    'department',
    'subject',
    'last_message_at',
    'unread_count',
    'last_message_preview',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.driverName,
        row.employeeNumber,
        row.department,
        row.subject,
        row.lastMessageAt,
        String(row.unreadCount),
        row.lastMessagePreview,
      ]
        .map((cell) => escapeCsvCell(cell))
        .join(','),
    );
  }

  return `\uFEFF${lines.join('\n')}`;
}
