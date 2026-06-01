export type PlanStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'sick' | 'vacation' | 'empty';

export type DateMode = 'today' | 'tomorrow' | 'custom';

export type Department = 'all' | 'go' | 'krage' | 'logistics';

export type StatusFilter = 'all' | 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface PlanAssignment {
  id: string;
  date: string;
  startHour: number;
  endHour: number;
  status: PlanStatus;
  serviceTask: string;
  notes: string;
}

export interface DriverPlanRow {
  id: string;
  department: Exclude<Department, 'all'>;
  driverName: string;
  vehiclePlate: string;
  company: string;
  phone: string;
  licenseExpiry: string;
  accidentCount: number;
  riskLevel: 'low' | 'medium' | 'high';
  assignments: PlanAssignment[];
  dayStatus?: Extract<PlanStatus, 'sick' | 'vacation'>;
}

export interface EinsatzplanFilters {
  dateMode: DateMode;
  customDate: string;
  department: Department;
  company: string;
  vehicle: string;
  status: StatusFilter;
}

export interface AlertItem {
  id: string;
  title: string;
  description: string;
  tone: 'warning' | 'danger' | 'info' | 'success';
}
