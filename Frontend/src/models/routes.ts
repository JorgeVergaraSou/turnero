export const PublicRoutes = {
    LOGIN: 'login',
    // link que llega por mail: /reset-password?token=<uuid> (el backend lo
    // arma con FRONTEND_URL — si cambia acá, cambia allá también)
    RESET_PASSWORD: 'reset-password',
    // consultar / cancelar un turno con código + DNI (paciente sin cuenta)
    MY_APPOINTMENT: 'mi-turno',
    // pantalla de la TV de la sala de espera (autenticada con token de pantalla, no con usuario)
    DISPLAY: 'pantalla',
}

export const PrivateRoutes = {
    PRIVATE: 'private',
    ADMIN: 'admin',
    RECEPCION: 'recepcion',
    MEDICO: 'medico',
    LOGOUT: 'logout',
    PERFIL: 'perfil',
    NUEVO_USUARIO: 'nuevo-usuario',
}

/** Rutas completas de las pantallas del personal (para links y navigate). */
export const StaffPaths = {
    // recepción (RECEPCIONISTA y ADMIN)
    RECEPTION_HOME: `/${PrivateRoutes.RECEPCION}`,
    AGENDA: `/${PrivateRoutes.RECEPCION}/agenda`,
    /** agenda abierta en un día (y opcionalmente un profesional) puntual */
    agendaFor: (date: string, professionalId?: number) =>
      `/${PrivateRoutes.RECEPCION}/agenda?fecha=${date}${professionalId ? `&profesional=${professionalId}` : ''}`,
    NEW_APPOINTMENT: `/${PrivateRoutes.RECEPCION}/nuevo-turno`,
    PATIENTS: `/${PrivateRoutes.RECEPCION}/pacientes`,
    // administración (ADMIN)
    ADMIN_HOME: `/${PrivateRoutes.ADMIN}`,
    PROFESSIONALS: `/${PrivateRoutes.ADMIN}/profesionales`,
    SCHEDULES: `/${PrivateRoutes.ADMIN}/horarios`,
    SPECIALTIES: `/${PrivateRoutes.ADMIN}/especialidades`,
    HEALTH_INSURANCES: `/${PrivateRoutes.ADMIN}/obras-sociales`,
    OFFICES: `/${PrivateRoutes.ADMIN}/consultorios`,
    DISPLAYS: `/${PrivateRoutes.ADMIN}/pantallas`,
    USERS: `/${PrivateRoutes.ADMIN}/usuarios`,
    AUDIT: `/${PrivateRoutes.ADMIN}/auditoria`,
    SETTINGS: `/${PrivateRoutes.ADMIN}/configuracion`,
    NEW_USER: `/${PrivateRoutes.NUEVO_USUARIO}`,
    // panel médico (MEDICO)
    DOCTOR_HOME: `/${PrivateRoutes.MEDICO}`,
    DOCTOR_PATIENTS: `/${PrivateRoutes.MEDICO}/pacientes`,
    doctorPatient: (id: number) => `/${PrivateRoutes.MEDICO}/pacientes/${id}`,
    attention: (appointmentId: number) => `/${PrivateRoutes.MEDICO}/atencion/${appointmentId}`,
    // comunes
    PROFILE: `/${PrivateRoutes.PERFIL}`,
    LOGOUT: `/${PrivateRoutes.LOGOUT}`,
}
