/* Sends a check's email from the server, with the PDF and zip attached, so the person on the phone
   does not have to go through their mail app. From the business: the email goes out through the
   STC mailbox named in Vercel's SMTP_USER and SMTP_PASSWORD (Microsoft 365, smtp.office365.com,
   port 587). Supabase cannot do this: its functions are not allowed out on port 587.

   Only a signed-in person whose role does checks can send. The email goes to the office addresses
   in the live checklist; `test` sends it to the mailbox itself instead. */
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gqsecmqlhblyivoourkx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1aEra9nrOSe_dT-nbZKnZQ_4k59Jzdx'; // the public key the app itself uses

interface Attachment { filename: string; contentBase64: string; contentType?: string }
interface Body { subject?: string; text?: string; attachments?: Attachment[]; test?: boolean }
interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: Body }
interface Res { status: (n: number) => Res; json: (b: unknown) => void }

export const config = { maxDuration: 60 };

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Send with POST.' });
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return res.status(500).json({ error: 'Sending is not set up: SMTP_USER and SMTP_PASSWORD are missing in Vercel.' });

  const auth = String(req.headers.authorization || '');
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false } });
  const me = await sb.rpc('touch_me');
  const who = me.data as { person: { name: string; email: string }; role: { perms: { do_checks?: boolean } } } | null;
  if (me.error || !who || !who.role?.perms?.do_checks) return res.status(403).json({ error: 'Your role can’t send checks.' });

  const b = req.body || {};
  if (!b.subject || !b.text) return res.status(400).json({ error: 'Nothing to send.' });
  let to: string[] = [user];
  if (!b.test) {
    const live = await sb.from('config_versions').select('config').eq('status', 'live').maybeSingle();
    const list = ((live.data?.config as { email?: { to?: string[] } } | undefined)?.email?.to || []).filter((x) => /@/.test(x));
    if (!list.length) return res.status(500).json({ error: 'No office address is set in the checklist.' });
    to = list;
  }

  const transport = nodemailer.createTransport({ host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true, auth: { user, pass } });
  try {
    const info = await transport.sendMail({
      from: { name: 'STC Checks', address: user },
      to,
      replyTo: who.person.email,
      subject: b.subject,
      text: b.text,
      attachments: (b.attachments || []).map((a) => ({ filename: a.filename, content: Buffer.from(a.contentBase64, 'base64'), contentType: a.contentType })),
    });
    return res.status(200).json({ ok: true, to, by: who.person.name, messageId: info.messageId, response: info.response });
  } catch (e) {
    const err = e as { message?: string; code?: string; response?: string; responseCode?: number };
    return res.status(502).json({ error: err.message || 'The mail server refused.', code: err.code, responseCode: err.responseCode, response: err.response });
  }
}
