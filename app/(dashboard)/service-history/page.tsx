'use client';

import { useMemo, useState } from 'react';
import { Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { formatDate } from '@/lib/utils';

interface ServiceHistoryRow {
	id: string;
	vehicle: string;
	vehicle_photo_url: string;
	actual_completion_date: string;
	license_plate: string;
	service_task: string;
	repair_company: string;
	total_cost_eur: number;
}

const MOCK_SERVICE_HISTORY: ServiceHistoryRow[] = [
	{
		id: 'svc-001',
		vehicle: 'Mercedes-Benz Actros 1845',
		vehicle_photo_url: 'https://images.unsplash.com/photo-1571987502539-1f1d0dcf9c5b?w=200&h=120&fit=crop',
		actual_completion_date: '2026-05-17',
		license_plate: 'B-FL 1001',
		service_task: 'Brake system maintenance',
		repair_company: 'Berlin Nutzfahrzeug Werkstatt',
		total_cost_eur: 1240,
	},
	{
		id: 'svc-002',
		vehicle: 'MAN TGX 18.510',
		vehicle_photo_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=120&fit=crop',
		actual_completion_date: '2026-05-12',
		license_plate: 'B-FL 1002',
		service_task: 'Engine oil and filter change',
		repair_company: 'Ankara Truck Service GmbH',
		total_cost_eur: 480,
	},
	{
		id: 'svc-003',
		vehicle: 'Scania R 450',
		vehicle_photo_url: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=200&h=120&fit=crop',
		actual_completion_date: '2026-05-03',
		license_plate: 'B-FL 1003',
		service_task: 'Tire replacement (rear axle)',
		repair_company: 'Munich Tire & Repair',
		total_cost_eur: 960,
	},
	{
		id: 'svc-004',
		vehicle: 'Volvo FH16',
		vehicle_photo_url: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=200&h=120&fit=crop',
		actual_completion_date: '2026-04-28',
		license_plate: 'B-FL 1004',
		service_task: 'Cooling system leak repair',
		repair_company: 'Hamburg Heavy Vehicle Service',
		total_cost_eur: 1785,
	},
];

export default function ServiceHistoryPage() {
	const [repairCompany, setRepairCompany] = useState('');

	const repairCompanies = useMemo(
		() => Array.from(new Set(MOCK_SERVICE_HISTORY.map((row) => row.repair_company))).sort(),
		[],
	);

	const filteredRows = useMemo(
		() => (repairCompany ? MOCK_SERVICE_HISTORY.filter((row) => row.repair_company === repairCompany) : MOCK_SERVICE_HISTORY),
		[repairCompany],
	);

	const totalCost = filteredRows.reduce((sum, row) => sum + row.total_cost_eur, 0);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Wrench className="w-6 h-6 text-orange-600" />
				<h1 className="text-2xl font-bold text-gray-900">Service History</h1>
			</div>

			<Card>
				<CardHeader>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<CardTitle className="text-base">Service Records</CardTitle>
						<div className="w-full sm:w-72">
							<Select value={repairCompany} onChange={(e) => setRepairCompany(e.target.value)}>
								<option value="">All Repair Companies</option>
								{repairCompanies.map((company) => (
									<option key={company} value={company}>
										{company}
									</option>
								))}
							</Select>
						</div>
					</div>
				</CardHeader>
				<CardContent className="p-0">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-gray-200 text-left">
								<th className="px-4 py-3 font-semibold text-gray-700">Vehicle</th>
								<th className="px-4 py-3 font-semibold text-gray-700">Actual Completion Date</th>
								<th className="px-4 py-3 font-semibold text-gray-700">License Plate</th>
								<th className="px-4 py-3 font-semibold text-gray-700">Service Tasks</th>
								<th className="px-4 py-3 font-semibold text-gray-700">Repair Company</th>
								<th className="px-4 py-3 font-semibold text-gray-700">Total Cost (EUR)</th>
							</tr>
						</thead>
						<tbody>
							{filteredRows.map((row) => (
								<tr key={row.id} className="border-b border-gray-100 last:border-b-0">
									<td className="px-4 py-3">
										<div className="flex items-center gap-3">
											<img
												src={row.vehicle_photo_url}
												alt={row.vehicle}
												className="h-7 w-10 rounded object-cover border border-gray-200"
												loading="lazy"
											/>
											<span className="font-medium text-gray-900">{row.vehicle}</span>
										</div>
									</td>
									<td className="px-4 py-3 text-gray-600">{formatDate(row.actual_completion_date)}</td>
									<td className="px-4 py-3 text-gray-700">{row.license_plate}</td>
									<td className="px-4 py-3 text-gray-700">{row.service_task}</td>
									<td className="px-4 py-3 text-gray-700">{row.repair_company}</td>
									<td className="px-4 py-3 text-gray-900">EUR {row.total_cost_eur.toLocaleString('en-US')}</td>
								</tr>
							))}
							{filteredRows.length === 0 && (
								<tr>
									<td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
										No records for selected repair company.
									</td>
								</tr>
							)}
						</tbody>
					</table>

					<div className="flex justify-end border-t border-gray-100 px-6 py-4">
						<p className="text-sm font-semibold text-gray-900">Total Cost: EUR {totalCost.toLocaleString('en-US')}</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
