/* What the office receives for a check: the PDF, Details.csv and the zip, and the
   share screen that sends them. */
import type { Check, Config, PhotoMeta } from '../../data/types';
import { reportName, detailsName, zipName } from '../check';
import { buildPdf } from './pdf';
import { buildCsv } from './csv';
import { buildZip } from './zip';

export { buildPdf } from './pdf';
export type { PdfOptions } from './pdf';
export { buildCsv, csvField, csvRow, csvColumns } from './csv';
export { buildZip, FOLDERS } from './zip';
export { emailBody, emailRows, shareCheck, downloadFile } from './email';

export async function outputFiles(
  c: Check, config: Config, photos: PhotoMeta[], getBlob: (p: PhotoMeta) => Promise<Blob>,
): Promise<{ pdf: File; zip: File; csv: File }> {
  const live = photos.filter((p) => !p.removedAt);
  const pdfBlob = await buildPdf(c, config, { photos: live });
  const csvText = buildCsv(c, config);
  const zipBlob = await buildZip(c, config, live, getBlob, pdfBlob);
  return {
    pdf: new File([pdfBlob], reportName(c), { type: 'application/pdf' }),
    zip: new File([zipBlob], zipName(c), { type: 'application/zip' }),
    csv: new File([csvText], detailsName(c), { type: 'text/csv' }),
  };
}
