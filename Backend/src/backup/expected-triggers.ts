/**
 * Triggers que tiene que tener la base: los que garantizan que los registros
 * de auditoría, las consultas finalizadas y las constancias legales no se
 * puedan modificar ni borrar. verify-restore.ts exige que existan TODOS en
 * una base restaurada. Si una migración nueva agrega un trigger, hay que
 * sumarlo acá (un test e2e compara esta lista con la base real y avisa).
 */
export const EXPECTED_TRIGGERS = [
  'trg_appointment_calls_no_delete',
  'trg_appointment_calls_no_update',
  'trg_appointment_status_history_no_delete',
  'trg_appointment_status_history_no_update',
  'trg_audit_logs_no_delete',
  'trg_audit_logs_no_update',
  'trg_consultation_amendments_no_delete',
  'trg_consultation_amendments_no_update',
  'trg_consultation_diagnoses_delete_fin',
  'trg_consultation_diagnoses_insert_fin',
  'trg_consultation_diagnoses_update_fin',
  'trg_consultation_medications_delete_fin',
  'trg_consultation_medications_insert_fin',
  'trg_consultation_medications_update_fin',
  'trg_consultation_study_requests_delete_fin',
  'trg_consultation_study_requests_insert_fin',
  'trg_consultation_study_requests_update_fin',
  'trg_consultations_no_delete',
  'trg_consultations_no_update_finalized',
  'trg_history_export_requests_no_delete',
  'trg_privacy_consents_no_delete',
  'trg_privacy_consents_no_update',
  'trg_privacy_notices_no_delete',
  'trg_privacy_notices_no_update',
] as const;
