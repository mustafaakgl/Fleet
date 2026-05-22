import apiClient from '../lib/api';

export const notificationsService = {
  listMyNotifications(userId: string) {
    return apiClient.get('/notifications', { params: { userId } });
  },

  getUnreadCount(userId: string) {
    return apiClient.get('/notifications/unread-count', { params: { userId } });
  },

  markAsRead(id: string, userId: string) {
    return apiClient.post(`/notifications/${id}/read`, { userId });
  },

  markAllAsRead(userId: string) {
    return apiClient.post('/notifications/read-all', { userId });
  },
};

export default notificationsService;
