export type CustomerCompanySummary = {
  id: string;
  name: string;
};

export type CustomerTenantRequest = {
  user?: { id: string; email: string; role: string };
  customerCompanyIds?: string[];
  customerCompanies?: CustomerCompanySummary[];
};
