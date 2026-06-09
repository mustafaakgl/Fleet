import type { ServiceRecord, Vehicle } from '@/lib/types';

export function isServiceHistoryMockRecord(id: string): boolean {
  return id.startsWith('mock-svc-');
}

const MOCK_VEHICLES: Vehicle[] = [
  { id: 'mock-veh-hv101', plate_number: 'HV 101', brand: 'Mercedes-Benz', model: 'Actros', status: 'active' },
  { id: 'mock-veh-av101', plate_number: 'AV 101', brand: 'MAN', model: 'TGX', status: 'active' },
  { id: 'mock-veh-bsa113', plate_number: 'BSA 113', brand: 'Volvo', model: 'FH', status: 'maintenance' },
  { id: 'mock-veh-hf109', plate_number: 'HF 109', brand: 'DAF', model: 'XF', status: 'active' },
  { id: 'mock-veh-kk205', plate_number: 'KK 205', brand: 'Scania', model: 'R-Series', status: 'active' },
  { id: 'mock-veh-mn442', plate_number: 'MN 442', brand: 'Iveco', model: 'S-Way', status: 'active' },
];

export function getServiceHistoryMockVehicles(): Vehicle[] {
  return MOCK_VEHICLES;
}

/** Demo rows aligned with Add Service Entry form fields (Fleetio-style). */
export const SERVICE_HISTORY_MOCK_RECORDS: ServiceRecord[] = [
  {
    id: 'mock-svc-001',
    vehicle_id: 'mock-veh-hv101',
    vehicle_plate: 'HV 101',
    driver_id: 'mock-driver-1',
    driver_name: 'Thomas Weber',
    date: '2026-06-10T18:39:00.000Z',
    service_type: 'Scheduled Maintenance — Brake Inspection; Spark Plugs Replacement',
    vendor: 'Werkstatt Nord GmbH',
    repair_company: 'Werkstatt Nord GmbH',
    cost_amount: 334.12,
    mileage_km: 72850,
    notes:
      'Reference: WO-38\nLabels: maintenance, brakes\nPriority: scheduled\nLine items:\n- Brake Inspection (€180.00)\n- Spark Plugs Replacement (€154.12)\nAttachments: photos\nRoutine scheduled service completed on time.',
  },
  {
    id: 'mock-svc-002',
    vehicle_id: 'mock-veh-av101',
    vehicle_plate: 'AV 101',
    driver_id: 'mock-driver-2',
    driver_name: 'Anna Schneider',
    date: '2026-06-09T14:15:00.000Z',
    service_type: 'Scheduled Maintenance — Tire Rotation; Engine Oil & Filter Replacement; Cabin Filter; Coolant Flush; Belt Inspection',
    vendor: 'Fleet Service Berlin',
    repair_company: 'Fleet Service Berlin',
    cost_amount: 147.93,
    mileage_km: 45210,
    notes:
      'Reference: WO-19\nLabels: maintenance, engine\nPriority: scheduled\nLine items:\n- Tire Rotation (€45.00)\n- Engine Oil & Filter Replacement (€62.93)\n- Cabin Filter (€22.00)\n- Coolant Flush (€12.00)\n- Belt Inspection (€6.00)\nAttachments: documents',
  },
  {
    id: 'mock-svc-003',
    vehicle_id: 'mock-veh-bsa113',
    vehicle_plate: 'BSA 113',
    driver_id: 'mock-driver-3',
    driver_name: 'Mehmet Yılmaz',
    date: '2026-06-08T10:39:00.000Z',
    service_type: 'Scheduled Maintenance — Tire Rotation; Engine Oil & Filter Replacement; Transmission Service; Brake Fluid; Alignment Check',
    vendor: 'TruckCare Leipzig',
    repair_company: 'TruckCare Leipzig',
    cost_amount: 147.93,
    mileage_km: 160,
    notes:
      'Reference: WO-99\nLabels: maintenance, tires\nPriority: scheduled\nLinked issues: incident-tire-wear\nLine items:\n- Tire Rotation (€35.00)\n- Engine Oil & Filter Replacement (€58.93)\n- Transmission Service (€32.00)\n- Brake Fluid (€12.00)\n- Alignment Check (€10.00)',
  },
  {
    id: 'mock-svc-004',
    vehicle_id: 'mock-veh-hf109',
    vehicle_plate: 'HF 109',
    driver_id: 'mock-driver-4',
    driver_name: 'Klaus Fischer',
    date: '2026-06-06T16:39:00.000Z',
    service_type: 'Scheduled Maintenance — Brake Inspection; Spark Plugs Replacement',
    vendor: 'Mobil Werkstatt Düsseldorf',
    repair_company: 'Mobil Werkstatt Düsseldorf',
    cost_amount: 200.15,
    mileage_km: 21,
    notes:
      'Reference: WO-60\nLabels: maintenance, brakes, engine\nPriority: scheduled\nLine items:\n- Brake Inspection (€110.00)\n- Spark Plugs Replacement (€90.15)\nLow-hour unit — first scheduled service.',
  },
  {
    id: 'mock-svc-005',
    vehicle_id: 'mock-veh-kk205',
    vehicle_plate: 'KK 205',
    driver_id: 'mock-driver-5',
    driver_name: 'Julia Hoffmann',
    date: '2026-06-05T09:20:00.000Z',
    service_type: 'Emergency Repair — Alternator Replacement; Battery Test',
    vendor: '24h Truck Notdienst',
    repair_company: '24h Truck Notdienst',
    cost_amount: 489.5,
    mileage_km: 198420,
    notes:
      'Reference: WO-72\nLabels: engine, warranty\nPriority: emergency\nLinked issues: incident-electrical\nLine items:\n- Alternator Replacement (€420.00)\n- Battery Test (€69.50)\nBreakdown on A2 — emergency roadside repair.',
  },
  {
    id: 'mock-svc-006',
    vehicle_id: 'mock-veh-mn442',
    vehicle_plate: 'MN 442',
    driver_id: 'mock-driver-6',
    driver_name: 'Stefan Richter',
    date: '2026-06-04T11:45:00.000Z',
    service_type: 'TUV Inspection; SP Inspection',
    vendor: 'DEKRA Stuttgart',
    repair_company: 'DEKRA Stuttgart',
    cost_amount: 189.0,
    mileage_km: 156300,
    notes:
      'Reference: WO-44\nLabels: compliance\nPriority: scheduled\nLine items:\n- TUV Inspection (€120.00)\n- SP Inspection (€69.00)\nAnnual compliance inspection passed.',
  },
  {
    id: 'mock-svc-007',
    vehicle_id: 'mock-veh-hv101',
    vehicle_plate: 'HV 101',
    driver_id: 'mock-driver-1',
    driver_name: 'Thomas Weber',
    date: '2026-06-02T08:00:00.000Z',
    service_type: 'Non-Scheduled Repair — Windshield Replacement',
    vendor: 'GlasPro Hamburg',
    repair_company: 'GlasPro Hamburg',
    cost_amount: 612.0,
    mileage_km: 72100,
    notes:
      'Reference: WO-31\nLabels: body, warranty\nPriority: non_scheduled\nLinked issues: incident-windshield\nLine items:\n- Windshield Replacement (€612.00)\nStone chip crack on autobahn.',
  },
  {
    id: 'mock-svc-008',
    vehicle_id: 'mock-veh-av101',
    vehicle_plate: 'AV 101',
    driver_id: 'mock-driver-2',
    driver_name: 'Anna Schneider',
    date: '2026-05-28T15:30:00.000Z',
    service_type: 'Scheduled Maintenance — A/C Recharge; Cabin Filter',
    vendor: 'Klima Service Berlin',
    repair_company: 'Klima Service Berlin',
    cost_amount: 98.4,
    mileage_km: 44800,
    notes:
      'Reference: WO-27\nLabels: maintenance, compliance\nPriority: scheduled\nLine items:\n- A/C Recharge (€68.40)\n- Cabin Filter (€30.00)',
  },
  {
    id: 'mock-svc-009',
    vehicle_id: 'mock-veh-bsa113',
    vehicle_plate: 'BSA 113',
    driver_id: 'mock-driver-3',
    driver_name: 'Mehmet Yılmaz',
    date: '2026-05-25T13:10:00.000Z',
    service_type: 'Scheduled Maintenance — Brake Pad Replacement; Rotor Resurfacing',
    vendor: 'TruckCare Leipzig',
    repair_company: 'TruckCare Leipzig',
    cost_amount: 445.8,
    mileage_km: 142,
    notes:
      'Reference: WO-88\nLabels: brakes, maintenance\nPriority: scheduled\nLine items:\n- Brake Pad Replacement (€320.00)\n- Rotor Resurfacing (€125.80)\nAttachments: photos, documents',
  },
  {
    id: 'mock-svc-010',
    vehicle_id: 'mock-veh-hf109',
    vehicle_plate: 'HF 109',
    driver_id: 'mock-driver-4',
    driver_name: 'Klaus Fischer',
    date: '2026-05-22T07:55:00.000Z',
    service_type: 'Scheduled Maintenance — DPF Cleaning; Emissions Test',
    vendor: 'Abgas Check Köln',
    repair_company: 'Abgas Check Köln',
    cost_amount: 267.25,
    mileage_km: 18,
    notes:
      'Reference: WO-55\nLabels: compliance, engine\nPriority: scheduled\nLine items:\n- DPF Cleaning (€210.00)\n- Emissions Test (€57.25)',
  },
  {
    id: 'mock-svc-011',
    vehicle_id: 'mock-veh-kk205',
    vehicle_plate: 'KK 205',
    driver_id: 'mock-driver-5',
    driver_name: 'Julia Hoffmann',
    date: '2026-05-18T10:00:00.000Z',
    service_type: 'Scheduled Maintenance — Tire Replacement; Wheel Balancing',
    vendor: 'Reifen Express Frankfurt',
    repair_company: 'Reifen Express Frankfurt',
    cost_amount: 892.0,
    mileage_km: 197800,
    notes:
      'Reference: WO-41\nLabels: tires, maintenance\nPriority: scheduled\nLine items:\n- Tire Replacement (€780.00)\n- Wheel Balancing (€112.00)',
  },
  {
    id: 'mock-svc-012',
    vehicle_id: 'mock-veh-mn442',
    vehicle_plate: 'MN 442',
    driver_id: 'mock-driver-6',
    driver_name: 'Stefan Richter',
    date: '2026-05-15T16:20:00.000Z',
    service_type: 'Scheduled Maintenance — Suspension Inspection; Shock Absorber Check',
    vendor: 'Fahrwerk Pro München',
    repair_company: 'Fahrwerk Pro München',
    cost_amount: 156.75,
    mileage_km: 155900,
    notes:
      'Reference: WO-22\nLabels: maintenance, body\nPriority: scheduled\nLine items:\n- Suspension Inspection (€86.75)\n- Shock Absorber Check (€70.00)',
  },
];

export const SERVICE_HISTORY_MOCK_ATTACHMENT_IDS = new Set([
  'mock-svc-001',
  'mock-svc-002',
  'mock-svc-009',
]);
