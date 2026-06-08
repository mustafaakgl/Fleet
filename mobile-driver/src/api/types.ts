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

export type MessengerLanguage = 'de' | 'tr' | 'en' | 'pl' | 'nl' | 'it' | 'es' | 'ru';
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

export type DriverDocumentsResponse = {
  uploadTypes: string[];
  requiredTypes: string[];
  missingRequired: string[];
  missingUploadableRequired: string[];
  items: DriverDocumentItem[];
};
