import apiClient from '../lib/api';

export interface DashboardQuery {
  date?: string;
  tomorrow?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
}

export const dashboardService = {
  getDashboardSummary(query?: DashboardQuery) {
    return apiClient.get('/dashboard', {
      params: query
        ? {
            ...query,
            tomorrow: query.tomorrow === undefined ? undefined : String(query.tomorrow),
          }
        : undefined,
    });
  },
};

export default dashboardService;
