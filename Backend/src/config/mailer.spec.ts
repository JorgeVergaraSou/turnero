// El transporter es un singleton de módulo (`transporterInstance`), así que
// cada test necesita su propia copia "fresca" del módulo (`jest.resetModules`
// + `jest.requireActual` dentro del test) para no arrastrar la instancia
// creada por el test anterior con un `MAIL_PORT`/env distinto.
describe('mailer.getTransporter', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function mockNodemailer() {
    const createTransport = jest.fn().mockReturnValue({ sendMail: jest.fn() });
    jest.doMock('nodemailer', () => ({ createTransport }));
    return createTransport;
  }

  it('usa secure:true en el puerto 465 (default sin MAIL_PORT)', async () => {
    delete process.env.MAIL_PORT;
    const createTransport = mockNodemailer();
    const { getTransporter } =
      jest.requireActual<typeof import('./mailer')>('./mailer');

    getTransporter();

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it('usa secure:false en el puerto 587 (STARTTLS) — antes quedaba hardcodeado en true', async () => {
    process.env.MAIL_PORT = '587';
    const createTransport = mockNodemailer();
    const { getTransporter } =
      jest.requireActual<typeof import('./mailer')>('./mailer');

    getTransporter();

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });

  it('toma host, user y password desde las env vars', async () => {
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_USER = 'user@example.com';
    process.env.MAIL_PASSWORD = 'secret';
    const createTransport = mockNodemailer();
    const { getTransporter } =
      jest.requireActual<typeof import('./mailer')>('./mailer');

    getTransporter();

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        auth: { user: 'user@example.com', pass: 'secret' },
      }),
    );
  });

  it('reutiliza la misma instancia entre llamadas (transporter lazy, creado una sola vez)', async () => {
    const createTransport = mockNodemailer();
    const { getTransporter } =
      jest.requireActual<typeof import('./mailer')>('./mailer');

    const first = getTransporter();
    const second = getTransporter();

    expect(first).toBe(second);
    expect(createTransport).toHaveBeenCalledTimes(1);
  });
});
