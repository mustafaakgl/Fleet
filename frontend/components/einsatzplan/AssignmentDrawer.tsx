import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import type { DriverPlanRow, PlanAssignment } from './types';

interface AssignmentDrawerProps {
  open: boolean;
  row: DriverPlanRow | null;
  assignment: PlanAssignment | null;
  onClose: () => void;
}

export function AssignmentDrawer({ open, row, assignment, onClose }: AssignmentDrawerProps) {
  if (!open || !row) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Assignment Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Driver Information</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 p-3 text-sm">
              <div>
                <dt className="text-gray-500">Name</dt>
                <dd className="font-medium text-gray-900">{row.driverName}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd className="font-medium text-gray-900">{row.phone}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-gray-500">Home address</dt>
                <dd className="font-medium text-gray-900">{row.homeAddress || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Department</dt>
                <dd className="font-medium text-gray-900 capitalize">{row.department}</dd>
              </div>
              <div>
                <dt className="text-gray-500">License Expiry</dt>
                <dd className="font-medium text-gray-900">{row.licenseExpiry}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Accident Count</dt>
                <dd className="font-medium text-gray-900">{row.accidentCount}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Risk Level</dt>
                <dd className="font-medium text-gray-900 capitalize">{row.riskLevel}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assignment Information</h3>
            {assignment ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 p-3 text-sm">
                <div>
                  <dt className="text-gray-500">Date</dt>
                  <dd className="font-medium text-gray-900">{assignment.date}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Vehicle</dt>
                  <dd className="font-medium text-gray-900">{row.vehiclePlate}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Company</dt>
                  <dd className="font-medium text-gray-900">{row.company}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Start Time</dt>
                  <dd className="font-medium text-gray-900">{`${String(Math.floor(assignment.startHour)).padStart(2, '0')}:00`}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">End Time</dt>
                  <dd className="font-medium text-gray-900">{`${String(Math.floor(assignment.endHour)).padStart(2, '0')}:00`}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd><StatusBadge status={assignment.status} /></dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-500">Notes</dt>
                  <dd className="font-medium text-gray-900">{assignment.notes}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500">
                No assignment block selected. Click a planned block to see timing details.
              </p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Actions</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm">Edit Assignment</Button>
              <Button variant="outline" size="sm">Change Driver</Button>
              <Button variant="outline" size="sm">Change Vehicle</Button>
              <Button variant="outline" size="sm">Send Message</Button>
              <Button variant="destructive" size="sm" className="col-span-2">Remove Assignment</Button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
