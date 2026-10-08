/* The zip, as the tree in source/08 S_output:
     {zipName}
       {reportName}
       {detailsName}
       1-Photos/              section P
       2-Damage/              section D
       3-Tyres-and-readings/  sections T and R
   Every photo keeps the file name it was given at capture. Photos are already
   compressed JPEGs, so they are stored, not compressed again. */
import JSZip from 'jszip';
import type { Check, Config, PhotoMeta, PhotoSection } from '../../data/types';
import { reportName, detailsName } from '../check';
import { buildCsv } from './csv';
import { buildPdf } from './pdf';

export const FOLDERS: Record<PhotoSection, string> = { P: '1-Photos', D: '2-Damage', T: '3-Tyres-and-readings', R: '3-Tyres-and-readings' };

export async function buildZip(
  c: Check, config: Config, photos: PhotoMeta[], getBlob: (p: PhotoMeta) => Promise<Blob>, pdf?: Blob,
): Promise<Blob> {
  const zip = new JSZip();
  const live = photos.filter((p) => !p.removedAt);
  const report = pdf || (await buildPdf(c, config, { photos: live }));
  zip.file(reportName(c), report, { compression: 'DEFLATE' });
  zip.file(detailsName(c), buildCsv(c, config), { compression: 'DEFLATE' });
  /* The three folders are always there, so the office always sees the same tree. */
  for (const name of new Set(Object.values(FOLDERS))) zip.folder(name);
  for (const p of live) {
    const blob = await getBlob(p);
    zip.file(FOLDERS[p.section] + '/' + p.fileName, blob, {
      compression: /\.jpe?g$/i.test(p.fileName) ? 'STORE' : 'DEFLATE',
      date: new Date(p.takenAt),
      binary: true,
    });
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}
