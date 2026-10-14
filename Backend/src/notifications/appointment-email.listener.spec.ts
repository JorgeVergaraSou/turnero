import { AppointmentEmailListener } from './appointment-email.listener';
import { AppointmentReminderPayload } from '@/appointments/appointment.events';

const sendMail = jest.fn().mockResolvedValue(undefined);
jest.mock('@/config/mailer', () => ({
  getTransporter: () => ({ sendMail }),
}));

const payload = (
  overrides: Partial<AppointmentReminderPayload> = {},
): AppointmentReminderPayload => ({
  appointmentId: 1,
  code: 'ABCD-1234',
  date: '2026-10-15',
  startTime: '10:30:00',
  contactEmail: 'paciente@example.com',
  patientFirstName: 'Mariana',
  professionalName: 'Ana Gómez',
  specialtyName: 'Clínica médica',
  officeName: 'Consultorio 1',
  officeAddress: 'Calle Falsa 123',
  stage: 1,
  confirmUrl: 'http://localhost:5173/confirmar?t=1.aaaaaaaaaaaaaaaaaaaaaaaa',
  ...overrides,
});

describe('AppointmentEmailListener (recordatorios)', () => {
  const settings = {
    get: jest
      .fn()
      .mockResolvedValue({ clinicName: 'Consultorio', contactPhone: null }),
  };
  const listener = new AppointmentEmailListener(settings as any);

  beforeEach(() => {
    sendMail.mockClear();
    process.env.MAIL_USER = 'consultorio@example.com';
  });

  it('el primer aviso recuerda el turno y NO lleva el botón de confirmar', async () => {
    await listener.onReminder(payload({ stage: 1 }));
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toMatch(/Recordatorio de turno/);
    expect(mail.html).not.toContain('Confirmo que voy');
    expect(mail.html).not.toContain('/confirmar?t=');
  });

  it('el segundo aviso pide confirmar y lleva el enlace', async () => {
    await listener.onReminder(payload({ stage: 2 }));
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toMatch(/confirmá que venís/);
    expect(mail.html).toContain('Confirmo que voy');
    expect(mail.html).toContain(
      'href="http://localhost:5173/confirmar?t=1.aaaaaaaaaaaaaaaaaaaaaaaa"',
    );
  });

  it('sin enlace (no hay FRONTEND_URL) el segundo aviso sale igual, sin botón', async () => {
    await listener.onReminder(payload({ stage: 2, confirmUrl: null }));
    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).not.toContain('Confirmo que voy');
  });

  it('el enlace va escapado: no se puede inyectar HTML', async () => {
    await listener.onReminder(
      payload({ stage: 2, confirmUrl: 'http://x/"><script>alert(1)</script>' }),
    );
    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).not.toContain('<script>');
  });

  it('sin email del paciente no manda nada', async () => {
    await listener.onReminder(payload({ stage: 2, contactEmail: null }));
    expect(sendMail).not.toHaveBeenCalled();
  });
});
