export type User = 'Ryan' | 'Nina' | 'Both';

export type Row = Record<string, any> & { id: string; createdTime?: string };

export type JournalRow = Row & {
  Entry?: string;
  Date?: string;
  Author?: User;
  Feeling?: string;
  Mood?: string;
  Symptoms?: string;
  Notes?: string;
};

export type MonitoringRow = Row & {
  Scan?: string;
  Date?: string;
  'Cycle Day'?: number;
  E2?: number;
  LH?: number;
  P4?: number;
  'Lining (mm)'?: number;
  'Lead Follicle (mm)'?: number;
  'Follicles Left'?: number;
  'Follicles Right'?: number;
  'Next Scan'?: string;
  Notes?: string;
};

export type AppointmentRow = Row & {
  Appointment?: string;
  Date?: string;
  Clinic?: string;
  Provider?: string;
  Purpose?: string;
  Prep?: string;
  'Questions to Ask'?: string;
  Results?: string;
  'Follow-up'?: string;
};

export type LabResultRow = Row & {
  Test?: string;
  Date?: string;
  Value?: number;
  Units?: string;
  'Reference Range'?: string;
  Notes?: string;
};

export type MedicationRow = Row & {
  Medication?: string;
  Dose?: string;
  Frequency?: string;
  Purpose?: string;
  'Insurance Status'?: string;
  'Qty Left'?: number;
  Refills?: number;
  'Start Date'?: string;
  'End Date'?: string;
  Notes?: string;
};
