export enum ConsultationStatus {
  /** el médico la está cargando: editable solo por su autor */
  BORRADOR = 'BORRADOR',
  /** inmutable: las correcciones se agregan como enmiendas */
  FINALIZADA = 'FINALIZADA',
}

export enum DiagnosisType {
  PRINCIPAL = 'PRINCIPAL',
  SECUNDARIO = 'SECUNDARIO',
}

export enum StudyRequestType {
  LABORATORIO = 'LABORATORIO',
  RADIOGRAFIA = 'RADIOGRAFIA',
  ECOGRAFIA = 'ECOGRAFIA',
  RESONANCIA = 'RESONANCIA',
  OTRO = 'OTRO',
}
