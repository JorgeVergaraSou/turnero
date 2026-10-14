import { createHash } from 'crypto';
import {
  buildHistoryPdf,
  computeChainHash,
  HistoryPdfInput,
  sha256Hex,
} from './history-export-pdf';
import { ConsultationView } from '../consultation-view';

/** Texto de un PDF sin comprimir: junta las cadenas hexadecimales de cada TJ. */
function pdfText(pdf: Buffer): string {
  const lines: string[] = [];
  for (const m of pdf.toString('latin1').matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    const chunks = [...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) =>
      Buffer.from(h[1], 'hex').toString('latin1'),
    );
    lines.push(chunks.join(''));
  }
  return lines.join('\n');
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function consultation(
  id: number,
  overrides: Partial<ConsultationView> = {},
): ConsultationView {
  return {
    id,
    appointmentId: id,
    patientId: 1,
    status: 'FINALIZADA',
    professional: {
      id: 1,
      firstName: 'Ana',
      lastName: 'Gómez',
      specialties: ['Clínica médica'],
    },
    reason: `Motivo ${id}`,
    anamnesis: null,
    physicalExam: null,
    evolution: 'Evolución favorable',
    indications: 'Reposo',
    observations: null,
    vitalSigns: {
      weightKg: 70,
      heightCm: null,
      systolicBp: 120,
      diastolicBp: 80,
      heartRate: null,
      temperatureC: null,
      oxygenSaturation: null,
    },
    diagnoses: [
      {
        id: 1,
        type: 'PRINCIPAL',
        description: 'Faringitis aguda',
        codeSystem: 'CIE-10',
        code: 'J02.9',
      },
    ],
    medications: [
      {
        id: 1,
        drugName: 'Ibuprofeno',
        dose: '400 mg',
        frequency: null,
        duration: null,
        notes: null,
      },
    ],
    studyRequests: [
      { id: 1, type: 'LABORATORIO', description: 'Hemograma', notes: null },
    ],
    amendments: [],
    startedAt: new Date('2026-03-10T13:00:00Z'),
    finalizedAt: new Date('2026-03-10T13:30:00Z'),
    finalizedByUserId: 5,
    contentHash: id === 1 ? HASH_A : HASH_B,
    ...overrides,
  } as unknown as ConsultationView;
}

const base = (consultations: ConsultationView[]): HistoryPdfInput => ({
  clinicName: 'Consultorio Central',
  contactPhone: '11 4000-0000',
  requestId: 77,
  issuedAt: new Date('2026-10-07T15:00:00Z'),
  issuedBy: {
    name: 'Ana Gómez',
    licenseNumber: 'MP-123',
    specialties: ['Clínica médica'],
  },
  patient: {
    fullName: 'Juan González',
    documentNumber: '30111222',
    birthDate: '1990-05-17',
  },
  consultations,
  authorNames: new Map([[5, 'Ana Gómez']]),
});

describe('buildHistoryPdf (copia de la historia clínica)', () => {
  it('genera un PDF válido', async () => {
    const pdf = await buildHistoryPdf(base([consultation(1)]));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toMatch(/%%EOF/);
  });

  it('incluye datos del paciente, fecha de emisión, emisor y solicitud', async () => {
    const text = pdfText(
      await buildHistoryPdf(base([consultation(1)]), { compress: false }),
    );
    expect(text).toContain('Copia de historia clínica');
    expect(text).toContain('Consultorio Central');
    expect(text).toContain('Juan González');
    expect(text).toContain('30111222');
    expect(text).toContain('17/05/1990');
    expect(text).toContain('07/10/2026 12:00'); // hora de Buenos Aires
    expect(text).toContain('Ana Gómez, matrícula MP-123');
    expect(text).toContain('N.º 77');
  });

  it('incluye el contenido clínico de cada consulta y su huella', async () => {
    const text = pdfText(
      await buildHistoryPdf(base([consultation(1), consultation(2)]), {
        compress: false,
      }),
    );
    expect(text).toContain('Consulta 1 de 2');
    expect(text).toContain('Consulta 2 de 2');
    expect(text).toContain('Motivo 1');
    expect(text).toContain('Faringitis aguda');
    expect(text).toContain('CIE-10 J02.9');
    expect(text).toContain('Ibuprofeno, 400 mg');
    expect(text).toContain('Hemograma');
    expect(text).toContain('Tensión arterial 120/80 mmHg');
    expect(text).toContain(HASH_A);
    expect(text).toContain(HASH_B);
  });

  it('incluye la huella global, calculada sobre las huellas en orden', async () => {
    const text = pdfText(
      await buildHistoryPdf(base([consultation(1), consultation(2)]), {
        compress: false,
      }),
    );
    expect(text).toContain(computeChainHash([HASH_A, HASH_B]));
    expect(computeChainHash([HASH_A, HASH_B])).not.toBe(
      computeChainHash([HASH_B, HASH_A]),
    );
  });

  it('lista las enmiendas debajo de su consulta, con autor, fecha y motivo', async () => {
    const withAmendment = consultation(1, {
      amendments: [
        {
          id: 1,
          authorUserId: 5,
          content: 'Se corrige la dosis',
          reason: 'Error de carga',
          createdAt: new Date('2026-03-11T13:00:00Z'),
        },
      ],
    });
    const text = pdfText(
      await buildHistoryPdf(base([withAmendment]), { compress: false }),
    );
    expect(text).toContain('Enmiendas posteriores a la finalización');
    expect(text).toContain('Se corrige la dosis');
    expect(text).toContain('Motivo: Error de carga');
    expect(text).toContain('11/03/2026');
  });

  it('un paciente sin consultas finalizadas igual recibe un PDF que lo aclara', async () => {
    const text = pdfText(await buildHistoryPdf(base([]), { compress: false }));
    expect(text).toContain('no tiene consultas finalizadas');
  });

  it('numera las páginas', async () => {
    const text = pdfText(
      await buildHistoryPdf(base([consultation(1), consultation(2)]), {
        compress: false,
      }),
    );
    expect(text).toMatch(/Página 1 de \d+/);
  });

  it('una historia larga se arma sin romperse (muchas páginas)', async () => {
    const long = 'Texto largo de evolución. '.repeat(400);
    const many = Array.from({ length: 30 }, (_, i) =>
      consultation(i + 1, { evolution: long }),
    );
    const pdf = await buildHistoryPdf(base(many));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
  });
});

describe('huellas', () => {
  it('sha256Hex coincide con SHA-256 de los bytes', () => {
    const data = Buffer.from('hola');
    expect(sha256Hex(data)).toBe(
      createHash('sha256').update(data).digest('hex'),
    );
  });

  it('la huella global cambia si cambia cualquier consulta', () => {
    expect(computeChainHash([HASH_A])).not.toBe(computeChainHash([HASH_B]));
    expect(computeChainHash([])).toMatch(/^[0-9a-f]{64}$/);
  });
});
