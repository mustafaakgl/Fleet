import apiClient from '../lib/api';

export type AccidentStatus = 'reported' | 'under_review' | 'resolved' | 'rejected';

export const accidentsService = {
  listIncidents() {
    return apiClient.get('/accidents');
  },

  getDriverIncidents(driverId: string) {
    return apiClient.get(`/accidents/driver/${driverId}`);
  },

  getVehicleIncidents(vehicleId: string) {
    return apiClient.get(`/accidents/vehicle/${vehicleId}`);
  },

  getCompanyIncidents(companyId: string) {
    return apiClient.get(`/accidents/company/${companyId}`);
  },

  recalculateDriverRisk(driverId: string) {
    return apiClient.post(`/accidents/recalculate-risk/${driverId}`);
  },

  getIncidentById(id: string) {
    return apiClient.get(`/accidents/${id}`);
  },

  createIncident(payload: unknown) {
    return apiClient.post('/accidents', payload);
  },

  updateIncident(id: string, payload: unknown) {
    return apiClient.patch(`/accidents/${id}`, payload);
  },

  updateIncidentStatus(id: string, status: AccidentStatus) {
    return apiClient.patch(`/accidents/${id}/status`, { status });
  },
};

export default accidentsService;
