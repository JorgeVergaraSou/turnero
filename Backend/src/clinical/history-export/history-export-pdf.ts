import { createHash } from 'crypto';
import moment from 'moment-timezone';
import PDFDocument from 'pdfkit';
import { CLINIC_TIMEZONE } from '@/common/utils/clinic-time.util';
import { ConsultationView } from '../consultation-view';

export interface HistoryPdfInput {
  clinicName: string;
  contactPhone: string | null;
  requestId: number;
  issuedAt: Date;
  issuedBy: {
    name: string;
    licenseNumber: string;
    specialties: string[];
  };
  patient: {
    fullName: string;
    documentNumber: string;
    birthDate: string | null;
  };
  /** solo consultas FINALIZADAS, de la más antigua a la más nueva */
  consultations: ConsultationView[];
  /** nombre de quien firmó cada enmienda, por id de usuario */
  authorNames: Map<number, string>;
}

export interface HistoryPdfOptions {
  /** false solo en los tests, para poder leer el texto del PDF */
  compress?: boolean;
}

/** SHA-256 de la lista ordenada de huellas de las consultas (huella global). */
export function computeChainHash(contentHashes: string[]): string {
  return createHash('sha256').update(contentHashes.join('\n')).digest('hex');
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

const fmtDateTime = (value: Date | string) =>
  moment(value).tz(CLINIC_TIMEZONE).format('DD/MM/YYYY HH:mm');
const fmtDate = (value: string) =>
  moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');

const INK = '#1f2933';
const SOFT = '#52606d';
const LINE = '#cbd2d9';
const MARGIN = 50;

/**
 * Copia de la historia clínica para el paciente. Incluye solo consultas
 * finalizadas, con sus diagnósticos, medicación, estudios y enmiendas, y la
 * huella SHA-256 de cada una (la que se calculó al finalizarla). El PDF se
 * arma en memoria: no toca el disco. Fuentes estándar de PDF (Helvetica):
 * cubren el español, sin archivos de fuentes que distribuir.
 */
export function buildHistoryPdf(
  input: HistoryPdfInput,
  options: HistoryPdfOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      compress: options.compress ?? true,
      info: {
        Title: 'Copia de historia clínica',
        Author: input.clinicName,
        Creator: input.clinicName,
        Producer: 'Turnero',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      render(doc, input);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function render(doc: PDFKit.PDFDocument, input: HistoryPdfInput) {
  const width = doc.page.width - MARGIN * 2;
  const ensureSpace = (needed: number) => {
    if (doc.y + needed > doc.page.height - MARGIN - 20) doc.addPage();
  };
  const rule = () => {
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + width, doc.y)
      .strokeColor(LINE)
      .lineWidth(0.7)
      .stroke();
    doc.moveDown(0.5);
  };
  const field = (label: string, value: string | null | undefined) => {
    if (!value || !value.trim()) return;
    ensureSpace(34);
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(SOFT)
      .text(label.toUpperCase(), { characterSpacing: 0.4 });
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(value);
    doc.moveDown(0.5);
  };
  const subtitle = (text: string) => {
    ensureSpace(40);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(text);
    doc.moveDown(0.2);
  };
  const bullet = (text: string) => {
    ensureSpace(20);
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(`•  ${text}`, {
      indent: 8,
    });
  };

  // --- portada ---
  doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(input.clinicName);
  if (input.contactPhone)
    doc.font('Helvetica').fontSize(10).fillColor(SOFT).text(input.contactPhone);
  doc.moveDown(1);
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(INK)
    .text('Copia de historia clínica');
  doc.moveDown(0.6);
  rule();
  field('Paciente', input.patient.fullName);
  field('Documento', input.patient.documentNumber);
  field(
    'Fecha de nacimiento',
    input.patient.birthDate ? fmtDate(input.patient.birthDate) : null,
  );
  field('Fecha y hora de emisión', fmtDateTime(input.issuedAt));
  const issuer = [
    input.issuedBy.name,
    `matrícula ${input.issuedBy.licenseNumber}`,
    input.issuedBy.specialties.join(', '),
  ]
    .filter(Boolean)
    .join(', ');
  field('Emitida por', issuer);
  field('Solicitud', `N.º ${input.requestId}`);
  field(
    'Contenido',
    input.consultations.length === 0
      ? 'El paciente no tiene consultas finalizadas.'
      : `${input.consultations.length} ${input.consultations.length === 1 ? 'consulta finalizada' : 'consultas finalizadas'}, de la más antigua a la más reciente. Las consultas que todavía no se finalizaron no se incluyen.`,
  );
  const chain = computeChainHash(
    input.consultations.map((c) => c.contentHash ?? ''),
  );
  field('Huella global (SHA-256)', chain);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(SOFT)
    .text(
      'Cada consulta lleva su huella SHA-256, calculada al finalizarla. Sirve para comprobar que el contenido no cambió desde entonces. Las enmiendas posteriores se listan debajo de la consulta que corrigen y no modifican su huella. La huella global es el SHA-256 de la lista de huellas de las consultas, en el orden de este documento.',
    );

  // --- consultas ---
  input.consultations.forEach((c, index) => {
    // la primera va en hoja nueva (después de la portada); las demás siguen donde quedó la anterior
    if (index === 0) doc.addPage();
    else {
      ensureSpace(260);
      doc.moveDown(1.5);
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(INK)
      .text(`Consulta ${index + 1} de ${input.consultations.length}`);
    doc.moveDown(0.3);
    rule();
    field('Fecha de atención', fmtDateTime(c.startedAt));
    const prof = c.professional;
    field(
      'Profesional',
      prof
        ? [
            `${prof.firstName ?? ''} ${prof.lastName ?? ''}`.trim(),
            prof.specialties.join(', '),
          ]
            .filter(Boolean)
            .join(', ')
        : null,
    );
    field('Motivo de consulta', c.reason);
    field('Anamnesis', c.anamnesis);
    field('Examen físico', c.physicalExam);

    const v = c.vitalSigns;
    const vitals = [
      v.weightKg !== null && `Peso ${v.weightKg} kg`,
      v.heightCm !== null && `Talla ${v.heightCm} cm`,
      v.systolicBp !== null &&
        v.diastolicBp !== null &&
        `Tensión arterial ${v.systolicBp}/${v.diastolicBp} mmHg`,
      v.heartRate !== null && `Frecuencia cardíaca ${v.heartRate} lpm`,
      v.temperatureC !== null && `Temperatura ${v.temperatureC} °C`,
      v.oxygenSaturation !== null &&
        `Saturación de oxígeno ${v.oxygenSaturation} %`,
    ].filter(Boolean);
    field('Signos vitales', vitals.join(' · '));

    field('Evolución', c.evolution);
    if (c.diagnoses.length) {
      subtitle('Diagnósticos');
      c.diagnoses.forEach((d) =>
        bullet(
          `${d.type === 'PRINCIPAL' ? 'Principal' : 'Secundario'}: ${d.description}${d.code ? ` (${d.codeSystem ?? 'código'} ${d.code})` : ''}`,
        ),
      );
      doc.moveDown(0.5);
    }
    if (c.medications.length) {
      subtitle('Medicación indicada');
      c.medications.forEach((m) =>
        bullet(
          [m.drugName, m.dose, m.frequency, m.duration, m.notes]
            .filter(Boolean)
            .join(', '),
        ),
      );
      doc.moveDown(0.5);
    }
    if (c.studyRequests.length) {
      subtitle('Estudios solicitados');
      c.studyRequests.forEach((s) =>
        bullet(
          [
            s.type.charAt(0) + s.type.slice(1).toLowerCase(),
            s.description,
            s.notes,
          ]
            .filter(Boolean)
            .join(': '),
        ),
      );
      doc.moveDown(0.5);
    }
    field('Indicaciones', c.indications);
    field('Observaciones', c.observations);

    if (c.amendments.length) {
      subtitle('Enmiendas posteriores a la finalización');
      c.amendments.forEach((a) => {
        ensureSpace(60);
        doc
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor(SOFT)
          .text(
            `${fmtDateTime(a.createdAt)}, ${input.authorNames.get(a.authorUserId) ?? 'profesional'}`,
          );
        doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(a.content);
        doc
          .font('Helvetica-Oblique')
          .fontSize(9.5)
          .fillColor(SOFT)
          .text(`Motivo: ${a.reason}`);
        doc.moveDown(0.5);
      });
    }

    ensureSpace(46);
    doc.moveDown(0.3);
    rule();
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(SOFT)
      .text(
        `Finalizada el ${c.finalizedAt ? fmtDateTime(c.finalizedAt) : '-'}. Huella SHA-256 de esta consulta:`,
      );
    doc
      .font('Courier')
      .fontSize(8.5)
      .fillColor(INK)
      .text(c.contentHash ?? '-');
  });

  // --- pie con numeración (hay que escribir con el margen inferior en 0) ---
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(SOFT)
      .text(
        `${input.patient.fullName}, documento ${input.patient.documentNumber} · Solicitud N.º ${input.requestId} · Página ${i + 1} de ${range.count}`,
        MARGIN,
        doc.page.height - 32,
        { width, align: 'center', lineBreak: false },
      );
    doc.page.margins.bottom = bottom;
  }
}
