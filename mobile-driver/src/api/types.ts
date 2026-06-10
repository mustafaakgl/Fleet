import type {
  AssignmentStatus,
  IncidentStatus,
  IncidentType,
  MorningCheckinStatus,
  NotificationStatus,
  RequestStatus,
  RequestType,
} from '@/domain/models';

export type DriverMeResponse = {
  user: {
    id: string;
    email: string;
    role: 'driver';
    language?: string;
    status: string;
    fullName: string;
  };
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
    status: string;
    riskLevel: string;
    employeeNumber?: string;
    licenseNumber?: string | null;
    licenseExpiryDate?: string | null;
    passportNumber?: string | null;
    passportExpiryDate?: string | null;
    assignedVehicle?: {
      id: string;
      plateNumber: string;
      brand: string;
      model: string;
    } | null;
    todayAssignment?: {
      id: string;
      workDate: string;
      startTime: string;
      endTime: string;
      vehicle: { id: string; plateNumber: string; brand: string; model: string };
      company: { id: string; name: string };
    } | null;
  };
};

export type DriverAssignment = {
  id: string;
  driver: { id: string; name: string };
  vehicle: { id: string; plateNumber: string };
  company: { id: string; name: string };
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  workDate: string;
  startTime: string;
  endTime: string;
  routeName?: string | null;
  notes?: string | null;
  status: AssignmentStatus;
};

export type DriverMorningCheckin = {
  id: string;
  date: string;
  submittedAt: string;
  vehiclePlate?: string | null;
  companyName?: string | null;
  cargoName?: string | null;
  cargoQuantity?: string | null;
  status: MorningCheckinStatus;
  conflictReason?: string | null;
  assignmentId?: string | null;
  notes?: string | null;
  locationSharingStarted?: boolean;
  handoverRequired?: boolean;
  handoverId?: string | null;
  handoverAssignmentId?: string | null;
  handoverVehicleId?: string | null;
};

export type HandoverPhotoSlot =
  | 'front'
  | 'right'
  | 'left'
  | 'rear'
  | 'tail_lift'
  | 'interior';

export type HandoverPhotoSummary = {
  id: string;
  fileName: string;
  /** @deprecated Use download_url — internal paths are not publicly served. */
  fileUrl?: string | null;
  download_url?: string | null;
};

export type DriverHandover = {
  id: string;
  driverId: string;
  vehicleId: string;
  previousVehicleId?: string | null;
  assignmentId?: string | null;
  handoverType: 'pickup' | 'return';
  handoverDateTime: string;
  photoRequired: boolean;
  photoStatus: 'not_required' | 'missing' | 'uploaded' | 'approved' | 'rejected';
  damageDetected: boolean;
  damageNotes?: string | null;
  status: 'pending' | 'completed';
  notes?: string | null;
  requiredPhotoSlots?: HandoverPhotoSlot[];
  photos?: Partial<Record<HandoverPhotoSlot, HandoverPhotoSummary>>;
  missingSlots?: HandoverPhotoSlot[];
  photosComplete?: boolean;
  driver?: { id: string; firstName: string; lastName: string };
  vehicle?: { id: string; plateNumber: string };
  assignment?: { id: string; workDate: string; startTime: string; endTime: string } | null;
};

export type DriverHandoverPhotoUploadResponse = {
  handover: DriverHandover;
  slot: HandoverPhotoSlot;
  photo: {
    id: string;
    fileName: string;
    fileUrl?: string | null;
  };
};

export type RequestAttachment = {
  id: string;
  fileName: string;
  /** @deprecated Use download_url */
  fileUrl?: string | null;
  download_url?: string | null;
};

export type DriverRequest = {
  id: string;
  driverId: string;
  type: RequestType;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: RequestStatus;
  createdAt?: string;
  attachments?: RequestAttachment[];
};

export type DriverTransportRequest = {
  id: string;
  driverId: string;
  vehicleId: string;
  companyId: string;
  vehicle?: { id: string; plateNumber: string };
  company?: { id: string; name: string };
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  requestedDate: string;
  startTime: string;
  endTime: string;
  status: string;
  conflictReason?: string | null;
  assignmentId?: string | null;
  createdAt?: string;
  attachments?: RequestAttachment[];
};

export type TransportFormOptions = {
  vehicles: Array<{ id: string; plateNumber: string }>;
  companies: Array<{ id: string; name: string }>;
  assignments: Array<{
    id: string;
    vehicleId: string;
    companyId: string;
    vehiclePlate: string;
    companyName: string;
    workDate: string;
    startTime: string;
    endTime: string;
  }>;
};

export type DriverIncident = {
  id: string;
  type: IncidentType;
  driverId: string;
  vehicleId: string;
  companyId?: string | null;
  assignmentId?: string | null;
  incidentDateTime: string;
  location?: string | null;
  description: string;
  cargoName?: string | null;
  cargoOwner?: string | null;
  status: IncidentStatus;
  createdAt?: string;
};

export type DriverNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  status: NotificationStatus;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessengerLanguage =
  | 'de'
  | 'tr'
  | 'en'
  | 'pl'
  | 'ro'
  | 'bg'
  | 'ar'
  | 'uk'
  | 'fr'
  | 'it'
  | 'es'
  | 'nl'
  | 'ru';
export type MessageTranslationStatus = 'translated' | 'failed' | 'not_requested' | 'pending';

export type ConversationParticipant = {
  userId: string;
  role: 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
  joinedAt: string;
  lastReadAt: string | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
  };
};

export type MessengerDriverSummary = {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
};

export type MessengerMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName: string;
  originalText: string;
  translatedText: string | null;
  originalLanguage: MessengerLanguage;
  targetLanguage: MessengerLanguage | null;
  translationStatus: MessageTranslationStatus;
  createdAt: string;
  readByCurrentUser: boolean;
};

export type ConversationListItem = {
  id: string;
  subject: string | null;
  driver: MessengerDriverSummary;
  participants: ConversationParticipant[];
  lastMessage: {
    id: string;
    senderUserId: string;
    senderName: string;
    originalText: string;
    translatedText: string | null;
    originalLanguage: MessengerLanguage;
    targetLanguage: MessengerLanguage | null;
    translationStatus: MessageTranslationStatus;
    createdAt: string;
  } | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type ConversationDetail = {
  id: string;
  subject: string | null;
  driver: MessengerDriverSummary;
  participants: ConversationParticipant[];
  lastMessageAt: string | null;
  unreadCount: number;
  messagesPreview: MessengerMessage[];
};

export type SendMessagePayload = {
  text: string;
  originalLanguage: MessengerLanguage;
  targetLanguage?: MessengerLanguage;
};

export type MessengerUnreadCount = {
  total: number;
  byConversation: Array<{
    conversationId: string;
    count: number;
  }>;
};

export type LocationTrackingStatus = 'active' | 'paused' | 'denied';

export type LocationStatusResponse = {
  consentGranted: boolean;
  consentAt: string | null;
  trackingStatus: LocationTrackingStatus;
  sharingActive: boolean;
  sharingStartedAt: string | null;
  sharingEndedAt: string | null;
  hasTrackableAssignmentToday: boolean;
  trackingAllowed: boolean;
  lastUpload: {
    recordedAt: string;
    receivedAt: string;
    vehicleId: string | null;
  } | null;
};

export type SubmitLocationPayload = {
  latitude: number;
  longitude: number;
  accuracyM?: number;
  speedMps?: number;
  headingDeg?: number;
  altitudeM?: number;
  recordedAt: string;
};

export type SubmitLocationResponse = {
  accepted: boolean;
  deduplicated: boolean;
  vehicleId: string | null;
  nextUploadAfterSec: number;
  lowAccuracy: boolean;
};

export type DriverDocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing' | 'archived';

export type DriverDocumentItem = {
  id: string;
  documentType: string;
  fileName: string;
  /** @deprecated Use download_url */
  fileUrl?: string | null;
  download_url?: string | null;
  status: DriverDocumentStatus;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LicenseCheckStep = 'front' | 'back' | 'selfie';

export type LicenseCheckPhotoMeta = {
  captured_at: string;
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
};

export type LicenseCheckStatusResponse = {
  driver_id: string;
  badge: 'green' | 'yellow' | 'red';
  can_submit: boolean;
  task_due?: string | null;
  check_requested_at?: string | null;
  has_pending_check: boolean;
};

export type LicenseCheckHistoryItem = {
  id: string;
  check_date: string;
  check_type: 'initial' | 'periodic';
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  verified_at?: string | null;
  created_at: string;
};

export type DriverDocumentsResponse = {
  uploadTypes: string[];
  requiredTypes: string[];
  missingRequired: string[];
  missingUploadableRequired: string[];
  items: DriverDocumentItem[];
};

export type DriverFineStatus =
  | 'neu'
  | 'fahrer_zugeordnet'
  | 'fahrer_benachrichtigt'
  | 'bezahlt'
  | 'widerspruch'
  | 'abgeschlossen';

export type DriverFineViolationCategory = 'speed' | 'parking' | 'red_light' | 'distance' | 'other';

export type DriverFine = {
  id: string;
  vehicle_id: string;
  vehicle: { id: string; plate_number: string; internal_code?: string | null };
  driver_id?: string | null;
  driver?: { id: string; name: string; employee_number: string } | null;
  violation_at: string;
  violation_location: string;
  violation_type: string;
  violation_category: DriverFineViolationCategory;
  amount?: number | null;
  payment_due_date?: string | null;
  notice_date?: string | null;
  status: DriverFineStatus;
  notes?: string | null;
  driver_notified_at?: string | null;
  driver_acknowledged_at?: string | null;
  pending_ack?: boolean;
  days_until_due?: number | null;
  document_url?: string | null;
  created_at: string;
  updated_at: string;
};

export type DepartureCheckItemStatus = 'ok' | 'defekt' | 'na';

export type DepartureCheckStatusResponse = {
  required: boolean;
  completed_today: boolean;
  can_submit: boolean;
  assignment: {
    id: string;
    work_date: string;
    start_time: string;
    company_name: string;
    vehicle_id: string;
    vehicle_plate: string;
  } | null;
  existing_check?: {
    id: string;
    overall_status: string;
    performed_at: string;
  } | null;
  template: {
    id: string;
    name: string;
    items: Array<{
      id: string;
      item_key: string;
      label: string;
      description?: string | null;
      sort_order: number;
      requires_photo_on_defect: boolean;
    }>;
  } | null;
  vehicle_compliance?: {
    has_blocking_defect: boolean;
    blocks_departure_check: boolean;
  } | null;
};

export type DriverDefectSeverity = 'kritisch' | 'mittel' | 'gering';
export type DriverDefectStatus = 'offen' | 'in_reparatur' | 'behoben' | 'bestaetigt';

export type DriverDefect = {
  id: string;
  vehicle_id: string;
  vehicle: { id: string; plate_number: string; internal_code?: string | null; status?: string | null };
  title: string;
  description: string;
  severity: DriverDefectSeverity;
  status: DriverDefectStatus;
  source: string;
  pending_confirmation?: boolean;
  photo_count: number;
  photo_urls?: string[];
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};
