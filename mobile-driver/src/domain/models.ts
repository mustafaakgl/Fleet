export type DriverRole = 'driver';

export type AssignmentStatus =
  | 'planned'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type MorningCheckinStatus =
  | 'confirmed'
  | 'waiting_for_review'
  | 'missing_vehicle_plate'
  | 'missing_company'
  | 'conflict'
  | 'added_to_einsatzplan'
  | 'rejected';

export type HandoverPhotoStatus =
  | 'not_required'
  | 'missing'
  | 'uploaded'
  | 'approved'
  | 'rejected';

export type RequestType =
  | 'vacation'
  | 'sick_leave'
  | 'training'
  | 'business_trip'
  | 'doctor_appointment'
  | 'special_leave'
  | 'overtime_compensation'
  | 'free_day'
  | 'other';

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type IncidentType = 'vehicle_accident' | 'cargo_damage';
export type IncidentStatus = 'reported' | 'under_review' | 'resolved' | 'rejected';
export type NotificationStatus = 'unread' | 'read';

export type DriverSession = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: DriverRole;
    language?: string;
  };
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
    status: string;
    riskLevel: string;
  };
};
