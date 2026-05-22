import type { Driver, DriverDetail, Vehicle, VehicleDetail } from './types';
import { getDriverRiskScore } from './utils';

export const mockDrivers: Driver[] = [
  {
    id: 'drv-101',
    first_name: 'Ali',
    last_name: 'Yilmaz',
    accident_count: 1,
    email: 'ali@fleet.com',
    phone: '+49 151 234 5671',
    license_number: 'TR-A1234567',
    license_expiry_date: '2028-06-14',
    passport_number: 'U12345678',
    passport_expiry_date: '2029-04-20',
    status: 'active',
    risk_level: getDriverRiskScore(1),
  },
  {
    id: 'drv-102',
    first_name: 'Mehmet',
    last_name: 'Demir',
    accident_count: 2,
    email: 'mehmet@fleet.com',
    phone: '+49 151 234 5672',
    license_number: 'TR-B9876543',
    license_expiry_date: '2027-12-01',
    passport_number: 'U23456789',
    passport_expiry_date: '2028-11-05',
    status: 'on_leave',
    risk_level: getDriverRiskScore(2),
  },
  {
    id: 'drv-103',
    first_name: 'Hasan',
    last_name: 'Kaya',
    accident_count: 0,
    email: 'hasan@fleet.com',
    phone: '+49 151 234 5673',
    license_number: 'TR-C4567891',
    license_expiry_date: '2026-09-09',
    passport_number: 'U34567890',
    passport_expiry_date: '2027-03-17',
    status: 'active',
    risk_level: getDriverRiskScore(0),
  },
  {
    id: 'drv-104',
    first_name: 'Emre',
    last_name: 'Acar',
    accident_count: 3,
    email: 'emre@fleet.com',
    phone: '+49 151 234 5674',
    license_number: 'TR-D1928374',
    license_expiry_date: '2026-04-01',
    passport_number: 'U45678901',
    passport_expiry_date: '2026-12-30',
    status: 'sick',
    risk_level: getDriverRiskScore(3),
  },
  {
    id: 'drv-105',
    first_name: 'Yusuf',
    last_name: 'Can',
    accident_count: 1,
    email: 'yusuf@fleet.com',
    phone: '+49 151 234 5675',
    license_number: 'TR-E5647382',
    license_expiry_date: '2029-01-19',
    passport_number: 'U56789012',
    passport_expiry_date: '2030-02-10',
    status: 'inactive',
    risk_level: getDriverRiskScore(1),
  },
];

export const mockVehicles: Vehicle[] = [
  {
    id: 'veh-001',
    plate_number: 'B-FL 1001',
    brand: 'Mercedes-Benz',
    model: 'Actros 1845',
    year: 2021,
    status: 'active',
    tuv_expiry_date: '2027-03-14',
    sp_expiry_date: '2026-11-20',
    current_driver: { id: 'drv-101', first_name: 'Ali', last_name: 'Yilmaz' },
  },
  {
    id: 'veh-002',
    plate_number: 'B-FL 1002',
    brand: 'MAN',
    model: 'TGX 18.510',
    year: 2020,
    status: 'active',
    tuv_expiry_date: '2026-12-01',
    sp_expiry_date: '2026-09-10',
    current_driver: { id: 'drv-102', first_name: 'Mehmet', last_name: 'Demir' },
  },
  {
    id: 'veh-003',
    plate_number: 'B-FL 1003',
    brand: 'Scania',
    model: 'R 450',
    year: 2019,
    status: 'in_service',
    tuv_expiry_date: '2026-08-18',
    sp_expiry_date: '2026-07-02',
    current_driver: { id: 'drv-103', first_name: 'Hasan', last_name: 'Kaya' },
  },
  {
    id: 'veh-004',
    plate_number: 'B-FL 1004',
    brand: 'Volvo',
    model: 'FH16',
    year: 2018,
    status: 'broken',
    tuv_expiry_date: '2026-06-10',
    sp_expiry_date: '2026-05-28',
    current_driver: null,
  },
  {
    id: 'veh-005',
    plate_number: 'B-FL 1005',
    brand: 'DAF',
    model: 'XF 480',
    year: 2022,
    status: 'active',
    tuv_expiry_date: '2027-10-05',
    sp_expiry_date: '2027-02-16',
    current_driver: null,
  },
];

export const mockDriverDetails: Record<string, DriverDetail> = {
  'drv-101': {
    ...mockDrivers[0],
    recent_assignments: [
      {
        id: 'asg-101',
        driver: { id: 'drv-101', name: 'Ali Yilmaz' },
        vehicle: { id: 'veh-001', plate_number: 'B-FL 1001' },
        company_name: 'Berlin Logistics',
        work_date: '2026-05-18',
        start_time: '08:00',
        end_time: '17:00',
        status: 'completed',
      },
    ],
    documents: [],
  },
  'drv-102': {
    ...mockDrivers[1],
    recent_assignments: [
      {
        id: 'asg-102',
        driver: { id: 'drv-102', name: 'Mehmet Demir' },
        vehicle: { id: 'veh-002', plate_number: 'B-FL 1002' },
        company_name: 'Munich Cargo',
        work_date: '2026-05-10',
        start_time: '09:00',
        end_time: '18:00',
        status: 'planned',
      },
    ],
    documents: [],
  },
};

export const mockVehicleDetails: Record<string, VehicleDetail> = {
  'veh-001': {
    ...mockVehicles[0],
    recent_assignments: [
      {
        id: 'asg-101',
        driver: { id: 'drv-101', name: 'Ali Yilmaz' },
        vehicle: { id: 'veh-001', plate_number: 'B-FL 1001' },
        company_name: 'Berlin Logistics',
        work_date: '2026-05-18',
        start_time: '08:00',
        end_time: '17:00',
        status: 'completed',
      },
    ],
    documents: [],
  },
  'veh-002': {
    ...mockVehicles[1],
    recent_assignments: [
      {
        id: 'asg-102',
        driver: { id: 'drv-102', name: 'Mehmet Demir' },
        vehicle: { id: 'veh-002', plate_number: 'B-FL 1002' },
        company_name: 'Munich Cargo',
        work_date: '2026-05-10',
        start_time: '09:00',
        end_time: '18:00',
        status: 'planned',
      },
    ],
    documents: [],
  },
};

export function filterMockDrivers(search: string, status: string, page: number, limit: number) {
  const query = search.trim().toLowerCase();
  const filtered = mockDrivers.filter((driver) => {
    const matchesSearch =
      query.length === 0
      || `${driver.first_name} ${driver.last_name}`.toLowerCase().includes(query)
      || (driver.email ?? '').toLowerCase().includes(query)
      || (driver.phone ?? '').toLowerCase().includes(query);
    const matchesStatus = !status || driver.status === status;
    return matchesSearch && matchesStatus;
  });

  const start = (page - 1) * limit;
  return {
    total: filtered.length,
    data: filtered.slice(start, start + limit),
  };
}

export function filterMockVehicles(search: string, status: string, page: number, limit: number) {
  const query = search.trim().toLowerCase();
  const filtered = mockVehicles.filter((vehicle) => {
    const matchesSearch =
      query.length === 0
      || vehicle.plate_number.toLowerCase().includes(query)
      || `${vehicle.brand} ${vehicle.model}`.toLowerCase().includes(query);
    const matchesStatus = !status || vehicle.status === status;
    return matchesSearch && matchesStatus;
  });

  const start = (page - 1) * limit;
  return {
    total: filtered.length,
    data: filtered.slice(start, start + limit),
  };
}
