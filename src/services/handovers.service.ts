import apiClient from '../lib/api';

export const handoversService = {
  listHandovers() {
    return apiClient.get('/vehicle-handovers');
  },

  getHandoverById(id: string) {
    return apiClient.get(`/vehicle-handovers/${id}`);
  },

  createHandover(payload: unknown) {
    return apiClient.post('/vehicle-handovers', payload);
  },

  createHandoverFromAssignment(assignmentId: string) {
    return apiClient.post(`/vehicle-handovers/from-assignment/${assignmentId}`);
  },

  updateHandover(id: string, payload: unknown) {
    return apiClient.patch(`/vehicle-handovers/${id}`, payload);
  },

  approvePhoto(id: string) {
    return apiClient.post(`/vehicle-handovers/${id}/approve-photo`);
  },

  rejectPhoto(id: string) {
    return apiClient.post(`/vehicle-handovers/${id}/reject-photo`);
  },

  completeHandover(id: string) {
    return apiClient.post(`/vehicle-handovers/${id}/complete`);
  },
};

export default handoversService;
